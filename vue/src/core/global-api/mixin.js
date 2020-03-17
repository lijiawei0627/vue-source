/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 将用户传入的mixin与this.options合并成一个新对象，然后赋给this.options
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
