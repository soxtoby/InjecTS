interface IBasilPlugin {
    setup(runTest: any): void;
}

declare namespace Basil {
    class TestRunner {
        registerPlugin(plugin: IBasilPlugin): void;
    }
}