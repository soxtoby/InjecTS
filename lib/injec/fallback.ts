import { Dependency } from './dependencies';
import { IParentContainer } from './container';
import { IParentLookup, Lookup } from './lookup';
import { Binding, bind } from './binding';
import { isDefined } from './types';

export function fallback(fallbackFn: (key: Dependency) => any, parentContainer?: IParentContainer) {
    return new FallbackContainer(fallbackFn, parentContainer);
}

class FallbackContainer implements IParentContainer {
    private parentContainer: IParentContainer;
    registeredBindings: IParentLookup<Dependency, Binding<any>>;

    constructor(fallbackFn: (key: Dependency) => any, parentContainer?: IParentContainer) {
        this.parentContainer = parentContainer || { registeredBindings: new Lookup<Dependency, Binding<any>>(), resolve() { } };
        this.registeredBindings = new FallbackContainerLookup(fallbackFn, this.parentContainer.registeredBindings);
    }

    resolve(key: Dependency) {
        return this.parentContainer.resolve(key);
    }
}

class FallbackContainerLookup implements IParentLookup<Dependency, Binding<any>> {
    constructor(private fallbackFn: (key: Dependency) => any, private parentLookup: IParentLookup<Dependency, Binding<any>>) { }

    get(key: Dependency): Binding<any> | undefined {
        let value = this.fallbackFn(key);
        return isDefined(value)
            ? bind().toValue(value)
            : this.parentLookup.get(key);
    }

    getAll(key: Dependency): Binding<any>[] {
        let value = this.fallbackFn(key);
        return this.parentLookup.getAll(key)
            .concat(isDefined(value) ? [bind().toValue(value)] : []);
    }
}
