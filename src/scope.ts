import { Lookup } from "./lookup";
import { Binding } from './binding';
import { isDisposable } from './types';

export class Scope {
    private lookup = new Lookup<Binding<any> | null, any>();

    get<T>(key: Binding<T> | null, resolveForKey: () => any) {
        let value = key ? this.lookup.get(key) : undefined;
        if (value != undefined)
            return value;
        value = resolveForKey();
        return key || isDisposable(value)
            ? this.lookup.add(key, this.disposable(key, value))
            : value
    }

    private disposable<T>(key: Binding<T> | null, value: any) {
        if (isDisposable(value)) {
            let innerDispose = value.dispose;
            value.dispose = () => {
                this.lookup.remove(key, value);
                innerDispose.call(value);
            };
        }
        return value;
    }

    dispose() {
        this.lookup.values()
            .filter(isDisposable)
            .forEach(value => value.dispose());
    }
}
