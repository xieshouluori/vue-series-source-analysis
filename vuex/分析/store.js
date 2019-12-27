


Vuex 用一个对象（store）包含全部的应用层级状态（state）。
Vuex 的核心就是 store（仓库）。

Vuex的特点：
（1）Vuex 的状态存储是响应式的。
（2）你不能直接改变 store 中的状态。改变 store 中的状态的唯一途径就是显式地提交 (commit) mutation。这样使得我们可以方便地跟踪每一个状态的变化。


Store的特点：
（1）为了防止store 对象变得臃肿，-----拆分成树型结构
  把一个大的 store 拆成一些 modules，整个 modules 是一个树型结构。store 本身可以理解为一个 root module，它下面的 modules 就是子模块。每个 module 又分别定义了 state，getters，mutations、actions，通过递归遍历模块的方式都完成了它们的初始化。

（2）为了 module 具有更高的封装度和复用性----- 定义了 namespace（命名空间） 的概念。  
    当模块被注册后，它的所有 getter、action 及 mutation 都会自动根据模块注册的路径调整命名名。
（3）为了建立state与getters之间的联系-----定义了一个内部的 Vue 实例

（4）设置严格模式
  在严格模式下监测 state 的变化是不是来自外部，确保改变 state 的唯一途径就是显式地提交 mutation。



