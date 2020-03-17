/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 如果该plugin已经存在于installedPlugins中了，为避免重复注册，则立即终止函数执行
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // 利用toArray方法：将除了第一个参数之外，剩余的所有参数得到的列表赋给args
    const args = toArray(arguments, 1)
    // 将Vue添加到args列表最前面
    args.unshift(this)
    // 判断plugin和plugin.install哪个是函数，即可得知用户使用哪种方式注册插件，然后执行用户编写的插件
    // 并将args作为参数传入（注意args的第一个参数为Vue）
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    // 将插件添加到installedPlugins中，保证相同插件不会反复被执行
    installedPlugins.push(plugin)
    return this
  }
}
