const conf = require("./config")()
const bodyParser = require('body-parser');
const { Client, MessageMedia, } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors')
const express = require('express');
const app = express();
const socketio = require("socket.io");
const http = require('http');
const server = http.createServer(app)
const io = socketio(server,{
    cors: conf.corsOptions
})
const _ = require('lodash');
const EventEmitter = require('events')
const emitter = new EventEmitter()
const path = require("path")

app.use(bodyParser.urlencoded({extended: true,limit: '50mb'}));
app.use(bodyParser.json({limit: '50mb'}));
app.use(cors());
app.use(express.urlencoded({extended:true}));

app.use(express.static(path.join(__dirname, "./dist")))

const puppeteerOptions = {
    args: [
        '--no-sandbox',
        '--ignore-certificate-errors',
        '--disabled-setupid-sandbox',
        '--start-maximized',
        '--disable-dev-shm-usage'
    ],
    executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'
}


let clientMap={};
let messageListMap ={};
//app.use(express.static(path.join(__dirname, "./dist")))


//----begin optional port number----
let isProduction = conf.args["is-production"];
if ( isProduction === undefined ) isProduction = conf.isProduction

let listenPort;
if (isProduction) listenPort = conf.ports.production
else listenPort = conf.ports.development
//----end optional port number----

server.listen(listenPort, ()=>console.log(`listening on the port ${listenPort}`))

const sendImage = async (token,b64,b64Name,num,type) =>{
    const mediaFile = await new MessageMedia(`${type}`,b64,`${b64Name}`)
    const x = await sendMessage(token,num, mediaFile)
    return x;
}

const findContantNameFromMessage = (contact,item)=>{
    return contact.id._serialized == item.author;
}

const getMessageHistoryGroup=async (token,num,limit)=>{
    let messages = []
    await clientMap[token].client.getChatById(`${num}`).then(async response=>{
        messages = await response.fetchMessages({
            limit:parseInt(limit)
        })
        await clientMap[token].client.getChats().then(res=>{
            messages.forEach(item => {
                if(item.hasMedia)
                    item.loading = true;
                
                let name;
                if(res.find(contact=>findContantNameFromMessage(contact,item)))
                    name= res.find(contact=>findContantNameFromMessage(contact,item)).name
                else{
                    if(item.author)
                        name = '+'+item.author.split('@')[0]
                    else
                        name = ""
                }
                item.name = name
            });
        })
        _.set(messageListMap,[`${clientMap[token].client.info.wid._serialized}`,`${num}`],messages)
    }).catch(err=>{
        console.error({'Error in getChatById':err})
    })
    return messages;
}

const getMessageHistory =async (token,num,limit)=>{
    let messages = []
    await clientMap[token].client.getChatById(`${num}`).then(async response=>{
        messages = await response.fetchMessages({
            limit:parseInt(limit)
        })
        messages.forEach(item => {
            if(item.hasMedia)
                item.loading = true;
        });
        _.set(messageListMap,[`${clientMap[token].client.info.wid._serialized}`,`${num}`],messages)
    }).catch(err=>{
        console.error({'Error in getChatById':err})
    })
    return messages;
}

const getContacts = async (token) =>{
        await clientMap[token].client.getChats().then(res=>{
            emitter.emit(`${token}`,{
                action:'get_chats_true',
                res,
            })
            
        }).catch(err=>{
            emitter.emit(`${token}`,{
                action:'get_chats_false',
                err,
                err_desc:"Gemiş kayıtlar alınamadı"
            })
        })
}

const loadImage = async (msg,selectedNum,token)=>{
    let media = _.get(messageListMap,[`${clientMap[token].client.info.wid._serialized}`,`${selectedNum}`],[]).find(item => findMessage(item,msg));
    let mediaKey = {};
    if(media.hasMedia){
        await media.downloadMedia().then(res=>{
            let key = 'data:'+res.mimetype+';base64,'+res.data
            mediaKey ={
                status:true,
                key,
            }
        }).catch(err=>{
            console.error({'Error in downloadMedia':err})
            mediaKey ={
                status:false,
                err,
                err_desc : "Media indirilemedi"
            }
        })
    }
    return mediaKey;
}

const sendSeen = async (token,id)=>{
    clientMap[token].client.sendSeen(id);
}

const findMessage = (item, msg)=>{
    return item.mediaKey == msg.mediaKey;
}

const sendMessage = async (token,number,message)=>{
    let response = await clientMap[token].client.sendMessage(number,message);

    return response;
}

const getChats = async (token) =>{
    let response = await clientMap[token].client.getChats()
    return response
}

//post

app.post('/api/logout/:token',(req,res)=>{
    const {token} = req.params;
    console.log({clientMap})
    delete clientMap[token];
    console.log({clientMap})
})

app.post('/api/auth_control',(req,res)=>{
    const {token} = req.body
    if(clientMap.hasOwnProperty(token))
        res.send({
            status:clientMap[token].isAuth,
        })
    else
        res.send({
            status:false,
            err: 'Kayıt bulunamadı'
        })
})

app.post('/api/send_seen/:token',(req,res)=>{
    const {token} = req.params
    const {id} = req.body
    sendSeen(token,id).then(response=>{
        res.send({
            status:200,
            data:"Mesaj görme başarılı"
        })
    }).catch(err=>{
        res.send({
            status:500,
            err,
            err_desc:"Mesaj görme işlemi başarısız"
        })
    })
})

app.post('/api/load_file',async (req,res)=>{
    const {msg,selectedNumber,token} = req.body;
    const response = await loadImage(msg,selectedNumber,token)
    res.send({
        response
    })
})

app.post('/api/send_message/:token',async (req,res)=>{
    const {token} = req.params;
    const {message} = req.body
    let num;
    if(req.body.hasOwnProperty('name')){
        const {name} = req.body;
        let chats = await clientMap[token].client.getChats()
        
        chats.forEach(item=>{
            if(_.snakeCase(item.name) == _.snakeCase(name))
                num = item.id._serialized
        })
    }
    else{
        const {number} = req.body
        num = number + '@c.us'
    }

    sendMessage(token,num,message).then(async response=>{
        response.links=[]
        await getContacts(token)
        res.send({
            status:true,
            response
        })
    }).catch(err=>{
        console.error('Error in sendMessage',err)
        res.send({
            status:false,
            err,
            err_desc:"Mesaj gönderilirken hata"
        })
    })

})

//get
app.get('/api/get_message_history/:token/:number/:limit',async (req,res)=>{
    const {token,number,limit} = req.params;
    let num ;
    if(number.length>12){
        num = number+'@g.us'
        await getMessageHistoryGroup(token,num,limit).then(response=>{
            res.send({
                response,
            })
        })
    }
    else{
        num = number+'@c.us'
        await getMessageHistory(token,num,limit).then(response=>{
            res.send({
                response,
            })
        })
    }
    
})

app.get('/api/get_contacts/:token',async (req,res)=>{
    const {token} = req.params
    getChats(token).then(response=>{
        emitter.emit(`${token}`,{
            action:'get_chats_true',
            response,
        })
        res.send({
            status:true,
            response,
        })
    }).catch(err=>{
        emitter.emit(`${token}`,{
            action:'get_chats_false',
            err,
            err_desc:"Gemiş kayıtlar alınamadı"
        })
        res.send({
            status:false,
            err,
            err_desc:"Gemiş kayıtlar alınamadı"
        })
    })
})

app.get('/api/get_profile_picture/:token',async (req,res)=>{
    const {token} = req.params;
    clientMap[token].client.getProfilePicUrl(clientMap[token].client.info.wid._serialized).then(response=>{
        res.send({
            status:true,
            response,
        })
    }).catch(err=>{
        console.error({'Error in profilePicture':err})
        res.send({
            status:false,
            err,
            err_desc:"Resim alınamadı"
        })
    })
})

app.get('/api/get_info/:token',async (req,res)=>{
    const {token} = req.params;
    clientMap[token].client.info.getBatteryStatus().then(response=>{
        const obj = {
            id:clientMap[token].client.info.wid._serialized,
            name:clientMap[token].client.info.pushname,
            wa_version:clientMap[token].client.info.phone.wa_version,
            battery:response.battery,
            platform:clientMap[token].client.info.platform,
            device:{
                os_version:clientMap[token].client.info.phone.os_version,
                os_build_number:clientMap[token].client.info.phone.os_build_number,
                manufacturer:clientMap[token].client.info.phone.device_manufacturer,
                model:clientMap[token].client.info.phone.device_model,
            }
        }
        res.send({
            status:true,
            response:obj
        })
    });
})

app.get('/api/is_sign_in/:token',async (req,res)=>{
    const {token} = req.params;
    if(clientMap[token].isReady){
        clientMap[token].client.getProfilePicUrl(clientMap[token].client.info.me._serialized).then(response=>{
            getChats(token).then(chat=>{
                res.send({
                    loading:false,
                    userNumber:{
                        number: clientMap[token].client.info.wid.user,
                        _serialized:clientMap[token].client.info.wid._serialized
                    },
                    ppImg:{
                        status:true,
                        data:response,
                    },
                    chat,
                })
            }).catch(err=>{
                console.error({'Error in getChatById':err})
            });
            
        }).catch(err=>{
            console.error({'Error in getChatById':err})
        })
       
    }
})

app.post('/api/send_file/:token',(req,res)=>{
    const {token} = req.params;
    const {b64,b64Name,number,type} = req.body;
    if(number.includes('-'))
        num = number + '@g.us'
    else
        num = number + '@c.us'
    sendImage(token,b64,b64Name,num,type).then(async response=>{
        await getContacts(token)
        res.send({
            status:true,
            response,
            data:{
                b64,
                b64Name,
                number,
                type
            }
        })
    }).catch(err=>{
        res.send({
            status:false,
            err,
            err_desc:"Resim gönderilemedi"
        })
    })
})




io.on('connection',socket=>{
    const socketToken = socket.handshake.auth.token;
    socket.join(`${socketToken}`);

    socket.on('disconnect',()=>{
        emitter.removeListener(socketToken,emitterControl)
    })

    socket.on('logout',()=>{
        clientMap[socketToken].client.destroy();
        delete clientMap[socketToken];
        withOutSession();
    });

    const withSession = () =>{
        const readyFunction = () =>{
            console.log('Client Hazır')
            listenMessage();
            getUserNumber();
            getProfileImage();
            getContacts(socketToken);
            clientMap[socketToken].isReady = true;
            socket.emit('start_loading',false)
        }

        if(!clientMap[socketToken].isHasSession){
            clientMap[socketToken].client = new Client({
                session: clientMap[socketToken].session,
                puppeteer: puppeteerOptions
            });
            clientMap[socketToken].isHasSession = true;
            clientMap[socketToken].client.initialize();

            clientMap[socketToken].client.on('ready', readyFunction);

            clientMap[socketToken].client.on('auth_failure',(err)=>{
                console.log({'Bağlanırken hata':err})
                socket.emit('auth_fail',{
                    status:401,
                    err,
                    err_desc:'Bağlantı hatası'
                })
            })
        }
        else
            readyFunction();
    }

    const emitterControl = (data)=>{
        if(data.action == 'get_chats_true'){
            socket.emit('get_contacts',{
                status:true,
                data:data.res
            });
        }
        else if(data.action == 'get_chats_false'){
            socket.emit('get_contacts',{
                status:false,
                err:data.err,
                err_desc:data.err_desc,
            });
        }
    }

    emitter.on(`${socketToken}`,emitterControl)

    const getProfileImage = () =>{
        clientMap[socketToken].client.getProfilePicUrl(clientMap[socketToken].client.info.wid._serialized).then((response)=>{
            socket.emit('get_profile_image',{
                status:true,
                data:response
            });
        }).catch(err=>{
            socket.emit('get_profile_image',{
                status:false,
                err,
                err_desc:'Profil resmi getirilemedi'
            });
        })
    }

    const getUserNumber = ()=>{
        socket.emit('user_number',{
            number:clientMap[socketToken].client.info.wid.user,
            _serialized:clientMap[socketToken].client.info.wid._serialized
        })
    }

    const withOutSession = () =>{
        clientMap.hasOwnProperty(socketToken) ? '' : createSession()
        console.log('Herhangi bir kayıt yok')
        clientMap[socketToken].client = new Client({
            puppeteer: puppeteerOptions
        }); 

        clientMap[socketToken].client.on('qr', qr => {
            qrcode.toDataURL(qr,(err,url)=>{
                socket.emit('qr_url',url)
            })
        });

        clientMap[socketToken].client.on('authenticated',async (session) => {
            clientMap[socketToken].isAuth = true;
            socket.emit('is_auth',clientMap[socketToken].isAuth)
            socket.emit('start_loading',true)
            clientMap[socketToken].session = session;
            clientMap[socketToken].client.destroy();
            withSession()
        });

        clientMap[socketToken].client.initialize();
    }

    const createSession = () =>{
        clientMap[socketToken] = {
            session : null,
            client : null,
            isAuth:false,
            isHasSession:false,
            isReady:false,
        }
    }

    const gettingMessage = async message =>{
        if(message.hasMedia){
            await message.downloadMedia().then(res=>{
                let key = 'data:'+res.mimetype+';base64,'+res.data
                message.mediaKey = key
            }).catch(err=>{
                console.error({'Error in gettingMessage downloadMedia':err})
                message.mediaKey="err"
            })
        }
        socket.emit('getting_message',message)
    }

    const listenMessage = async () => {
        await clientMap[socketToken].client.on('message',async (message)=>{
            getContacts(socketToken);
            gettingMessage(message);
        })
    }

    if(clientMap.hasOwnProperty(socketToken))
        clientMap[socketToken].isHasSession ? withSession() : withOutSession()
    else
        withOutSession();
})