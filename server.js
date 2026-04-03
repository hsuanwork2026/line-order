const express = require('express')
const line = require('@line/bot-sdk')
const { Pool } = require('pg')
const app = express()

const config = {
  channelSecret: 'b849944abe3ede63e22dea748f011943',
  channelAccessToken: 'lf5vscNztL39LDmV1yuN8ERLpINC61lzCFt4md0Axz9LGzDB3V231SCF9Y9PzQFNZq0kVVMSqxg7kMfn2RsV1BAQ49yDeEwbJW2PF/T2Frz8Xv/ocqx7LbOubgHTWee1yAgf51IAMn+qOhMlR4sr+AdB04t89/1O/w1cDnyilFU='
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name TEXT,
      item_name TEXT,
      item_price INTEGER,
      status TEXT DEFAULT '待處理',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)
  console.log('資料庫初始化完成')
}

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
})

app.use('/webhook', line.middleware(config))

app.post('/webhook', (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error(err)
      res.status(500).end()
    })
})

const menu = [
  { id: 1, name: '雞腿飯', price: 100 },
  { id: 2, name: '排骨飯', price: 110 },
  { id: 3, name: '滷肉飯', price: 60 },
]

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return

  const userMessage = event.message.text

  if (userMessage === '菜單' || userMessage === '點餐') {
    const menuText = menu.map(item => `${item.name} - $${item.price}`).join('\n')
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `📋 今日菜單：\n\n${menuText}\n\n請輸入餐點名稱來點餐！` }]
    })
  }

  if (userMessage === '我的訂單') {
    const result = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT 5'
    )
    if (result.rows.length === 0) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '您還沒有任何訂單！' }]
      })
    }
    const orderText = result.rows.map(o =>
      `#${o.id} ${o.item_name} $${o.item_price} - ${o.status}`
    ).join('\n')
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `📦 最近訂單：\n\n${orderText}` }]
    })
  }

  const selectedItem = menu.find(item => userMessage.includes(item.name))
  if (selectedItem) {
    await pool.query(
      'INSERT INTO orders (customer_name, item_name, item_price) VALUES ($1, $2, $3)',
      ['LINE用戶', selectedItem.name, selectedItem.price]
    )
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `✅ 收到點餐！\n\n${selectedItem.name} x1\n金額：$${selectedItem.price}\n\n請稍候！輸入「我的訂單」可查看訂單狀態。` }]
    })
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: '您好！輸入「菜單」或「點餐」來查看今日菜單 🍱' }]
  })
}

app.get('/orders', async (req, res) => {
  const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC')
  res.json({ success: true, data: result.rows })
})

app.listen(3000, async () => {
  await initDB()
  console.log('伺服器啟動成功！')
})