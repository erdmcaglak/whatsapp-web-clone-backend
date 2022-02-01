# Server


## Production Mode

`config/config.json`
>       isProduction: true

or

```bash
node app.js --is-production=1
```

## PM2 process manager
### Start Server
#### Production Mode


```bash
pm2 start "node app.js --is-production=1" --name="server-production"
```

#### Development Mode


```bash
pm2 start "node app.js --is-production=1" --name="server-development"
```

### Restart
#### Production Mode


```bash
pm2 restart server-production
```

#### Development Mode


```bash
pm2 restart server-development
```



## Conf

Ports:
`config/config.json`
>       ports.development | ports.production