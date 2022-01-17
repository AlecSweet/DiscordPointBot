import userModel from "../db/user";
import { ICallback, ICommand } from "../wokTypes";

const deleteAll: ICommand = {
    name: 'deleteAll',
    category: 'pointGain',
    description: 'delete',
    ownerOnly: true,
    init: () => {},
    callback: async (options: ICallback) => {
        const { message } = options
        await userModel.deleteMany({})
        message.reply({
            content: `Everyone's nuked`
        })
    }
}

export default deleteAll