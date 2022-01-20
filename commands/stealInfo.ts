import { ICallback, ICommand } from "../wokTypes";

const stealInfo: ICommand = {
    name: 'stealInfo',
    category: 'asd',
    description: 'asds',
    ownerOnly: true,
    callback: (options: ICallback) => {
        const { guild, message } = options

        guild.members.fetch()
            .then((members) => {
                const mems = members.map(member => {
                    return {
                        name: member.user.username,
                        nickname: member.nickname,
                        id: member.user.id
                    }
                })
                const memStrings: string[] = mems.map(m => {
                    return `Id  ${m.id}, Name: ${m.name}, Nickname: ${m.nickname}`
                })
                
                message.reply({
                    content: memStrings.join('\n')
                })
            })
            .catch(console.error)
    }
}

export default stealInfo