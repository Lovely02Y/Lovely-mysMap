import path from "path"

//支持锅巴
export function supportGuoba() {
    return {
    // 插件信息，将会显示在前端页面
    // 如果你的插件没有在插件库里，那么需要填上补充信息
    // 如果存在的话，那么填不填就无所谓了，填了就以你的信息为准
    pluginInfo: {
        name: 'Lovely-mysMap',
        title: 'Lovely-mysMap',
        author: '@02',
        authorLink: 'https://github.com/Lovely-02',
        link: 'https://github.com/Lovely02Y/Lovely-mysMap',
        isV3: true,
        isV2: false,
        description: '一个适用于Yunzai-Bot的全新提瓦特地图资源查询'
    }
    }
}