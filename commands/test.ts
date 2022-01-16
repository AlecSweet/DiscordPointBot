export default {
    name: 'ping',
    category: 'asd',
    description: 'asds',
    callback: ({message}) => {
        message.reply({
            content: `${message.author} Test send by ${message.author.id}`
        })
    }
}