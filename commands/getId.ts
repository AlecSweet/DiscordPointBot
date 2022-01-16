import { ICallback, ICommand } from "../wokTypes";

const getId: ICommand = {
    name: 'getId',
    category: 'asd',
    description: 'asds',
    expectedArgs: '<users @>',
    minArgs: 1,
    maxArgs: 1,
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    callback: (options: ICallback) => {
        const { message, args } = options
        message.reply({
            content: `${args[0]}'s id is: ${args[0].replace(/\D/g,'')}`
        })
    }
}

export default getId