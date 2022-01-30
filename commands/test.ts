import betModel from "../db/bet";
import { ICommand } from "../wokTypes";

const stuff: ICommand = {
    name: 'stuff',
    category: 'asd',
    description: 'asds',
    ownerOnly: true,
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    callback: async () => {
        await betModel.deleteMany({})
        console.log('deleted')
    }
}

export default stuff