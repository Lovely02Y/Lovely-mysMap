import plugin from '../../lib/plugins/plugin.js'
import common from '../../lib/common/common.js'
import puppeteer from '../../lib/puppeteer/puppeteer.js'
import { exec } from 'node:child_process'
import { resolve } from 'node:path'
import fetch from 'node-fetch'
import fs from 'node:fs'
import YAML from 'yaml'

export class MysMap extends plugin {
  constructor () {
    super({
      name: '米游社大地图',
      dsc: '找资源',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      priority: 2000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*((提瓦特|渊下宫|层岩巨渊|地下矿区|旧(日之)?海)?((哪有|哪里有)(.+))|((.+)(在哪|在哪里|哪有|哪里有|位置|点位))(？|\\?)?)$',
          /** 执行方法 */
          fnc: 'mysMap'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(原神|米游社)?地图资源列表$',
          /** 执行方法 */
          fnc: 'resList'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(地图|找资源)帮助$',
          /** 执行方法 */
          fnc: 'mapHelp'
        },
        {
          /** 命令正则匹配 */
          reg: '^(.*)[0-9a-zA-Z]{2}$',
          /** 执行方法 */
          fnc: 'pointDetail',
          /** 执行日志 */
          log: false
        },
        {
          /** 命令正则匹配 */
          reg: '^#(安装|更新)地图资源包?$',
          /** 执行方法 */
          fnc: 'initMap',
          /** 权限 master,owner,admin,all */
          permission: 'master'
        }
      ]
    })
    /** 定时任务 */
    this.task = {
      cron: '0 0 0/6 * * ?',
      name: '更新米游社大地图资源',
      fnc: () => this.init()
    }
    this.path = './plugins/mysMap'
  }

  async init () {
    await common.downFile('https://api-static.mihoyo.com/common/map_user/ys_obc/v2/map/label/tree?map_id=2&app_sn=ys_obc&lang=zh-cn', `${this.path}/data/label.json`)
    MysMap.label_json = this.readJson(`${this.path}/data/label.json`)

    let name = this.readJson(`${this.path}/data/资源别称.yaml`, 'yaml') || {}
    let tree = MysMap.label_json?.data.tree
    if (!tree) return

    tree.forEach(val => {
      val.children.forEach(v => {
        name[v.id] ||= [v.name]

        let iconFile = `${this.path}/html/icon/${v.id}.png`
        if (!fs.existsSync(iconFile)) {
          common.downFile(v.icon, iconFile)
        }
      })
    })
    this.writeJson(`${this.path}/data/资源别称.yaml`, name, 'yaml')
  }

  async mysMap () {
    if (this.initCheck() === false) return

    let { label, map } = this.filterMsg()
    if (!label.id) {
      await this.reply(`${map.name}没有找到资源「${label.name}」，\n可能米游社wiki未更新或不存在该资源\n发送【#地图资源列表】查看所有资源名称`)
      return
    }

    let rsp
    let file = `${this.path}/images/${map.id}/${label.id}`
    let version = fs.readFileSync(`${this.path}/images/version`, 'utf8')
    let data = this.readJson(`${file}.json`) || { timestamp: 0 }

    try {
      rsp = await (await fetch(`https://hlhs-nb.cn/api/genshin/map?label_id=${label.id}&map_id=${map.id}&version=${version}&p=1.3`)).json()

      if (rsp.status == -4) {
        await this.reply('地图资源包发生变化\n请【#更新地图资源包】\n\n若更新失败请删除 `mysMap/images` 目录\n并重新【#安装地图资源包】')
        return
      } else if (rsp.status !== 0) {
        await this.reply(rsp.message)
        return
      }

      if (data.timestamp < rsp.data.timestamp || this.e.msg.includes('更新')) {
        await this.reply(`「${label.name}」资源更新中...`)
        await common.downFile(`https://hlhs-nb.cn${rsp.data.image}`, `${file}.jpg`)
        this.writeJson(`${file}.json`, rsp.data)
      }
    } catch (err) {
      rsp = { data }
    }

    await this.reply([
      `资源 ${label.name} 的位置如下`,
      { origin: true, ...segment.image(`${file}.jpg`) },
      `\n※ ${label.name} 一共找到 ${rsp.data.label_total} 个位置点\n※ 数据来源于米游社wiki\n※ 发送【地图帮助】查看说明`
    ])
  }

  async resList () {
    if (MysMap.img) {
      await this.reply(MysMap.img)
      return
    }

    if (this.initCheck() === false) return

    MysMap.label_json ||= this.readJson(`${this.path}/data/label.json`)
    let tree = MysMap.label_json?.data.tree

    let files = []
    let mapIds = [2, 7, 9, 34]
    mapIds.forEach(id => files.push(...fs.readdirSync(`${this.path}/images/${id}`)))

    let data = Array.from({ length: 2 }, () => [])
    /** 第一页列表 */
    let oneList = ['传送点', '贵重收集物', '露天宝箱', '解谜宝箱', '区域特产', '背包/素材']
    /** 移除项 */
    let discardList = ['传送点', '地标']

    for (let val of tree) {
      if (val.children.length < 1 || discardList.includes(val.name)) continue

      let item = { title: val.name, list: [] }

      val.children.forEach(v => {
        if (!files.includes(`${v.id}.json`)) return

        if (v.name.length > 5) v.name = `${v.name.slice(0, 5)}…`

        item.list.push({
          name: `#${v.id}<br><span>${v.name}</span>`,
          icon: resolve(`${this.path}/html/icon/${v.id}.png`)
        })
      })

      if (item.list.length < 1) continue

      if (!oneList.includes(val.name)) {
        data[1].push(item)
      } else {
        data[0].push(item)
      }
    }

    MysMap.img = [
      await this.render({ data: data[0] }),
      await this.render({ data: data[1] })
    ]

    if (MysMap.img[0]) {
      await this.reply(MysMap.img)
    }
  }

  mapHelp () {
    let msg = '【#清心在哪|#旧海清心在哪】\n【#清心AK】查询坐标信息\n【#地图资源列表】全部资源名称'
    this.reply(msg)
  }

  async pointDetail () {
    if (!this.e.msg || this.e.img) return false
    let { msg, map } = this.filterMsg()

    let keyRet = /[0-9a-zA-Z]{2}$/.exec(msg)
    if (!keyRet) return false

    let key = keyRet[0]
    msg = msg.replace(key, '').trim()

    let label = this.labelMap(msg)
    let file = `${this.path}/images/${map.id}/${label?.id}.json`
    if (!msg || Number(msg) || !label || this.initCheck() === false || !fs.existsSync(file)) return false

    let data = this.readJson(file)
    if (!data.info[key]) {
      await this.reply(`${map.name}资源「${label.name}」没有找到「${key}」标点`)
      return
    }
    let url = `https://api-static.mihoyo.com/common/map_user/ys_obc/v1/map/point/info?map_id=${map.id}&point_id=${data.info[key]}&app_sn=ys_obc&lang=zh-cn`
    let rsp = await (await fetch(url)).json()
    let message = [`资源「${label.name + key}」描述信息：\n`]
    let { info } = rsp?.data || {}
    if (info) {
      if (info.content) {
        message.push(info.content)
      }
      if (info.img) {
        message.push(segment.image(info.img))
      }
      if (message.length < 2) {
        await this.reply(`资源「${label.name + key}」暂无描述`)
        return
      }
      await this.reply(message)
    }
  }

  async initMap () {
    let msg = this.e.msg.replace(/#|＃|地图资源包?/g, '')
    let command = msg == '更新' ? 'git checkout . && git pull' : `git clone https://gitee.com/QQ1146638442/mys_map.git "${this.path}/images/" --depth=1`

    if (MysMap.installing) {
      await this.reply(`地图资源包${msg}中...`)
    } else if (fs.existsSync(`${this.path}/images/2`)) {
      if (msg == '安装' && fs.readdirSync(`${this.path}/images/2`).length > 600) {
        await this.reply('地图资源包已安装!')
      } else {
        let version = fs.readFileSync(`${this.path}/images/version`, 'utf8')
        let rsp = await (await fetch(`https://hlhs-nb.cn/api/genshin/map?label_id=2&map_id=2&version=${version}&p=1.3`)).json()

        if (rsp.status == 0) {
          await this.reply('地图资源包已是最新!')
          return
        }

        await this.reply('开始更新地图资源包，请耐心等待~')

        MysMap.installing = true

        exec(command, { cwd: `${this.path}/images/` }, (error) => {
          MysMap.installing = false

          if (error) {
            logger.error(error)
            this.reply(`地图资源包更新失败！\nError code: ${error.code}\n${error.message}\n 请删除 ‘mysMap/images’ 目录\n并重新【#安装地图资源包】`)
          } else {
            this.reply('地图资源包更新成功！')
          }
        })
      }
    } else {
      await this.reply('开始安装地图资源包，请耐心等待~')

      MysMap.installing = true

      exec(command, (error) => {
        MysMap.installing = false
        if (error) {
          this.reply(`地图资源包安装失败！\nError code: ${error.code}\n${error.message}\n 请删除 ‘mysMap/images’ 目录\n并重新【#安装地图资源包】`)
          if (fs.existsSync(`${this.path}/images`)) {
            fs.rmdirSync(`${this.path}/images`)
          }
        } else {
          this.reply('地图资源包安装成功！')
          this.init()
        }
      })
    }
  }

  initCheck () {
    let tips = '尚未安装地图资源包\n请先【#安装地图资源包】'
    let path = `${this.path}/images/2`

    if (
      !fs.existsSync(path) ||
      fs.readdirSync(path).length < 300
    ) {
      this.reply(tips)
      return false
    }
  }

  filterMsg () {
    let reg = /＃|#|更新|提瓦特|渊下宫|层岩巨渊|地下矿区|旧(日之)?海|在|哪|里|有|位置|点位|？|\?/g
    let msg = this.e.msg.replace(reg, '')

    let label = this.labelMap(msg) || { id: null, name: msg }
    let map = { id: 2, name: '提瓦特' }

    if (this.e.msg.includes('渊下')) {
      map = { id: 7, name: '渊下宫' }
    } else if (/层岩|矿区/.test(this.e.msg)) {
      map = { id: 9, name: '层岩巨渊' }
    } else if (/旧(日之)?海/.test(this.e.msg)) {
      map = { id: 34, name: '旧日之海' }
    }

    return { msg, label, map }
  }

  labelMap (name) {
    let customName = this.readJson(`${this.path}/data/资源别称.yaml`, 'yaml') || {}
    let names = customName[name]

    if (names) return { name: names[0], id: name }

    for (let id in customName) {
      if (customName[id].includes(name)) return { name: customName[id][0], id }
    }
  }

  render (data = {}) {
    return puppeteer.screenshot('地图资源列表', {
      tplFile: `${this.path}/html/label.html`,
      imgType: 'jpeg',
      res: resolve(`${this.path}/html`),
      quality: 100,
      ...data
    })
  }

  readJson (file, format) {
    try {
      if (format == 'yaml') return YAML.parse(fs.readFileSync(file, 'utf8'))
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      return false
    }
  }

  writeJson (savePath, data, format) {
    let content = format == 'yaml' ? YAML.stringify(data) : JSON.stringify(data, null, 2)
    return fs.writeFileSync(savePath, content)
  }
}
