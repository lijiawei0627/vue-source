/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 缓存了runtime中的的$mount方法（缓存了原型上的$mount⽅法，再重新定义该⽅法）
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  // 可以传入字符串el或者直接传入元素
  el?: string | Element,
 // hydrating跟服务端渲染有关，在浏览器环境下，可以不传第二个参数
  hydrating?: boolean
): Component {
  // 如果el存在，就调用query方法对el进行转换，返回dom对象赋给el
  el = el && query(el)

  // 对el做了限制，因为Vue实例不能挂载在body、html这样的根节点上，否则会报错
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }
  // 拿到用户传递进来的配置options
  const options = this.$options
  // 判断用户是否有写render方法，当没有直接使用render函数时，通过解析template/el并转换为呈现函数
  if (!options.render) {
    let template = options.template
    // 判断是否定义了template
    if (template) {
      if (typeof template === 'string') {
        // 当template是以"#tmp1"这样的形式存在时，
        // 通过idToTemplate方法（内部再次使用了query(el)方法）去获取template组件
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          // 当没有找到对应的元素时，会进行报错
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        } 
      } else if (template.nodeType) {
        // 当template为DOM节点的时候，拿到template的innerHTML
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) { 
      // 当没有定义template时，通过el去获取el的outerHTML返回给template
      template = getOuterHTML(el)
    }
    // 通过上面转换之后得到的template来得到render方法
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }
      // 将template编译成render函数，这里会有render以及staticRenderFns两个返回，
      // 这是vue的编译时优化，static静态不需要在VNode更新时进行patch，优化性能
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      // 生成render方法和staticRenderFns,放到options身上，方便后续使用
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 调用const mount = Vue.prototype.$mount保存下来的不带编译的mount方法
  // 也就是执行runtime中的$mount方法
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
