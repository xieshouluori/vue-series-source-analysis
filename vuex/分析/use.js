export function initUse(Vue: GlobalAPI) {
  Vue.use = function(plugin: Function | Object) {
    //获取已经安装的插件列表
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []);
    // 判断该插件是否已经安装过---即是否已经存入插件列表中
    if (installedPlugins.indexOf(plugin) > -1) {
      return this;
    }

    // additional parameters
    // 将第二个参数以后的所有参数 转换成数组
    const args = toArray(arguments, 1);
    //将Vue对象添加到参数数组的起始位置
    args.unshift(this);

    if (typeof plugin.install === 'function') {
      // 如果插件为对象，并且存在install方法，则使用apply方法调用plugin的install方法，并将整理好的数组当成参数传入install方法中。
      plugin.install.apply(plugin, args);
    } else if (typeof plugin === 'function') {
      // 如果插件本身为函数，则直接调用这个函数并将整理好的数组当成参数传入
      plugin.apply(null, args);
    }
    //将该插件添加入已经安装的插件列表中
    installedPlugins.push(plugin);
    return this;
  };
}

四步：
步一：获取已经安装的插件列表，判断是否已经安装过该插件。若安装过则直接返回 Vue实例。

步二：将传入的参数转成数组，并在初始位置插入Vue对象。

步三：判断插件是否有install方法，如果该插件有install方法，则调用install方法。否则直接调用插件。

步四：将该插件插入已经安装的插件列表。