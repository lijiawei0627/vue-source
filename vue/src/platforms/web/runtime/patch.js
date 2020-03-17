/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

// 	nodeOps封装了⼀系列DOM操作的⽅法，modules定义了⼀些模块的钩⼦函数的实现

// createPathFunction中定义了许多修饰性的函数，
// 之所以经过高阶函数createPatchFunction一些修饰之后再返回path，是因为Vue.js现在一个可以
// 跨端的平台，在web和weex上的api是不一样的。将所有nodeOps、modules传入，
// 通过函数柯里化的技巧，在createPatchFunction中就将两者差异消除掉，避免了多余的if、else逻辑
// 在后续使用patch方法时，就不用再传入一些差异化的参数
export const patch: Function = createPatchFunction({ nodeOps, modules })
