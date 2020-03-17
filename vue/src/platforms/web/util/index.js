/* @flow */

import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 */
export function query (el: string | Element): Element {
  // 如果传入的el是字符串，就通过document.querySelector来获取dom对象
  if (typeof el === 'string') {
    const selected = document.querySelector(el)
    // 判断是否获取到传进来的dom对象
    if (!selected) {
      // 提示找不到元素，进行报错
      process.env.NODE_ENV !== 'production' && warn(
        'Cannot find element: ' + el
      )
      // 返回一个div元素
      return document.createElement('div')
    }
    return selected
  } else {
    // 如果传入的是个dom对象，就直接返回
    return el
  }
}
