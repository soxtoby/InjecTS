import * as sinon from "sinon";
import "./lib/basil/basil";

Object.assign(sinon, {
    config: {
        injectIntoThis: true,
        injectInto: null,
        properties: ["assert", "spy", "stub", "mock", "clock", "sandbox"],
        useFakeTimers: true,
        useFakeServer: false
    }
});

Basil.TestRunner.prototype.registerPlugin({
    setup: function(runTest) {
        sinon.test(runTest).call(this);
    }
});