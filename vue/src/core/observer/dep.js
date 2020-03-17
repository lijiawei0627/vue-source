/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
// Dep是整个getter依赖收集的核⼼
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    // 给每个依赖关系Dep设置一个不同的id（每创建一个Dep，uid都会自增）
    this.id = uid++
    // 将Watcher（观察者对象）收集到subs中
    this.subs = []
  }
  // 添加一个观察者对象
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }
  // 移除一个观察者对象
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }
  // 依赖收集，当存在Dep.target的时候添加观察者对象
  depend () {
    // 特别注意的是Dep有⼀个静态属性target，这是⼀个全局唯⼀Watcher，
    // 这是⼀个⾮常巧妙的设计，因为在同⼀时间只能有⼀个全局的Watcher被计算，
    // 另外它的⾃⾝属性subs也是Watcher的数组。
    if (Dep.target) {
      // 注意：在pushTarget方法中把Dep.target赋值为当前的渲染watcher并压栈（为了恢复⽤）
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

// 在Watcher类中的get方法中，通过调用pushTarget方法，
// 将当前watcher push到targetStack中（考虑嵌套组件），同时将自身watcher观察者实例设置给Dep.target，用以依赖收集。
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  // 子组件依赖收集完成之后，执行出栈
  targetStack.pop()
  // 获取上一级target
  Dep.target = targetStack[targetStack.length - 1]
}
