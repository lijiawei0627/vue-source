import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// VUE是一个⽤Function实现的类，我们只能通过new	Vue去实例化它。
// 为何`Vue`不⽤`ES6`的Class去实现呢？我们往后看这⾥有很多`xxxMixin`的函数调⽤，
// 并把`Vue`当参数传⼊，它们的功能都是给`Vue`的`prototype`上扩展⼀些⽅法
// `Vue`按功能把这些扩展分散到多个模块中去实现，
// ⽽不 是在⼀个模块⾥实现所有，这种⽅式是⽤	`Class`难以实现的。
function Vue (options) {
  // Vue是一个构造函数，只能通过new关键字来进行初始化
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    // Vue是构造函数，应使用“new”关键字调用
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // _init方法在init.js中绑定到了Vue的原型上。
  this._init(options)
}

// 给	Vue	的	prototype	上扩展⼀些⽅法
initMixin(Vue)  // 挂载_init方法
stateMixin(Vue)  // 挂载$set、$watch、$delete方法
eventsMixin(Vue)  // $on、$once、$off、$emit方法
lifecycleMixin(Vue)  // $foreUpdate、$destroy、_update方法
renderMixin(Vue) // $nextTick、_render方法

export default Vue
