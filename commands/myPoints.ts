import getUserAndAccruePoints from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const myPoints: ICommand = {
    name: 'myPoints',
    category: 'pointCheck',
    description: 'Check my points',
    callback: async (options: ICallback) => {
        const { message } = options

        const user = await getUserAndAccruePoints(message.author.id)

        message.reply({content: `You have ${user.points} points.`})
    }
}

export default myPoints