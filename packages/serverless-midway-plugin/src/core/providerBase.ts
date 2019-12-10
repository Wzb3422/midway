
import { IServerless, IServerlessOptions, ICommandObject, ICommand, IHooks, IConfig, Ilayer } from '../interface/midwayServerless';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { render } from 'ejs';
import { formatLayers } from './utils';
export class ProviderBase {

  static isProvider = true;
  public provider: any;
  serverless: IServerless;
  options: IServerlessOptions;
  commands: ICommand;
  hooks: IHooks;
  servicePath: string;
  midwayBuildPath: string;

  constructor(serverless: IServerless, options: IServerlessOptions) {
    this.serverless = serverless;
    this.options = options;
    this.commands = {};
    this.hooks = {};
    this.servicePath = this.serverless.config.servicePath;
    this.midwayBuildPath = join(this.servicePath, '.serverless');
  }

  protected bindCommand(cmdObj: any, link?: any): IConfig {
    const processedInput = this.serverless.processedInput && this.serverless.processedInput.commands || [];
    const cmdList = Object.keys(cmdObj).filter(cmd => {
      if (link[cmd]) { // 关联命令 比如 deploy关联着package
        const linkRes = link[cmd].find(cmd => {
          return processedInput.indexOf(cmd) !== -1;
        });
        if (linkRes) {
          return true;
        }
      }
      return processedInput.indexOf(cmd) !== -1;
    });

    const commandList: ICommand[] = [];
    const hooksList: IHooks[] = [];
    cmdList.forEach((cmd: string) => {
      const commandObj: ICommandObject = cmdObj[cmd];
      if (commandObj.getCommand) {
        commandList.push(commandObj.getCommand());
      }
      if (commandObj.getHooks) {
        hooksList.push(commandObj.getHooks());
      }
    });
    return {
      commands: Object.assign({}, ...commandList),
      hooks: Object.assign({}, ...hooksList)
    };
  }

  async loadWrapper(WrapperContent: string) {
    const files = {};
    for (const func in this.serverless.service.functions) {
      const handlerConf = this.serverless.service.functions[func];
      const [handlerFileName, name] = handlerConf.handler.split('.');
      if (!files[handlerFileName]) {
        files[handlerFileName] = {
          handlers: [],
          originLayers: []
        };
      }
      files[handlerFileName].originLayers.push(handlerConf.layers);
      files[handlerFileName].handlers.push({
        name,
        handler: handlerConf.handler
      });
    }
    for (const file in files) {
      const fileName = join(this.midwayBuildPath, `${file}.js`);
      const layers = this.getLayers(this.serverless.service.layers, ...files[file].originLayers);
      const content = this.writeCodeToFile(WrapperContent, {
        handlers: files[file].handlers,
        ...layers
      });
      writeFileSync(fileName, content);
    }
  }

  private writeCodeToFile(WrapperContent, options) {
    return render(WrapperContent, options);
  }

  private getLayers(...layersList: Ilayer[]) {
    const layerTypeList = formatLayers(...layersList);
    const layerDeps = [];
    const layers = [];

    if (layerTypeList && layerTypeList.npm) {
      Object.keys(layerTypeList.npm).forEach((originName: string) => {
        const name = 'layer_' + originName;
        layerDeps.push({ name, path: layerTypeList.npm[originName] });
        layers.push(name);
      });
    }
    return {
      layerDeps,
      layers
    };
  }

  async callCommand(command: string, options?: any) {
    if (options) {
      Object.keys(options).forEach(option => {
        this.serverless.processedInput.options['option'] = options[option];
      });
    }
    return this.serverless.pluginManager.invoke.call(this.serverless.pluginManager, [command], true);
  }
}