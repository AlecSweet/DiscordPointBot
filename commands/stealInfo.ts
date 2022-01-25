import { ICommand } from "../wokTypes";
import getRandomValues from 'get-random-values'

const stealInfo: ICommand = {
    name: 'test',
    category: 'asd',
    description: 'asds',
    ownerOnly: true,
    callback: () => {
        //const { guild, message } = options
        let i = 0
        let avg = 0
        while ( i < 10000) {
            avg += getRandomValues(new Uint8Array(1))[0];
            i++
        }

        console.log(avg/10000)
    }
}

export default stealInfo