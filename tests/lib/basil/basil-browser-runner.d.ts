type BasilTest = (description: string, test: Function) => void;
declare var when: BasilTest,
            then: BasilTest,
            describe: BasilTest,
            it: BasilTest;
declare var basil: Basil.TestRunner;