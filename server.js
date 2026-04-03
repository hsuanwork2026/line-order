const express = require('express')
const line = require('@line/bot-sdk')
const { Pool } = require('pg')
const path = require('path')
const app = express()

const config = {
  channelSecret: 'b849944abe3ede63e22dea748f011943',
  channelAccessToken: '4whlhzl4qYDR8UquXfAeQWWvNY4TsI+OX9Rxl+dtThIbPL3BdF+6/q5DFrBGS/O9Zq0kVVMSqxg7kMfn2RsV1BAQ49yDeEwbJW2PF/T2Frws/FGBoBa9SMWV+2bUo1O7ayM06OeMjHF4pfJLo7Sn6AdB04t89/1O/w1cDnyilFU='
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
      items JSONB,
      total_price INTEGER,
      status TEXT DEFAULT '待處理',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)
  console.log('資料庫初始化完成')
}

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
})

app.use(express.static(path.join(__dirname, 'public')))
app.use('/webhook', line.middleware(config))
app.use(express.json())

app.post('/webhook', (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => { console.error(err); res.status(500).end() })
})

app.post('/order', async (req, res) => {
  const { customerName, items } = req.body
  const totalPrice = items.reduce((sum, i) => sum + i.price, 0)
  await pool.query(
    'INSERT INTO orders (customer_name, items, total_price) VALUES ($1, $2, $3)',
    [customerName || 'LINE用戶', JSON.stringify(items), totalPrice]
  )

  // 通知老闆
  const itemList = items.map(i => `・${i.name} $${i.price}`).join('\n')
  await client.pushMessage({
    to: 'U3c74e1a853f680557220e3809302216d',
    messages: [{ type: 'text', text: `🔔 新訂單！\n\n${itemList}\n\n總計 $${totalPrice}` }]
  })

  res.json({ success: true })
})

app.get('/orders', async (req, res) => {
  const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC')
  res.json({ success: true, data: result.rows })
})

app.patch('/order/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id])
  res.json({ success: true })
})

const menu = [
  { name: '𩵚魠魚焿(焿)', price: 90 },
  { name: '𩵚魠魚焿(飯)', price: 100 },
  { name: '𩵚魠魚焿(麵)', price: 100 },
  { name: '𩵚魠魚焿(米粉)', price: 100 },
  { name: '浮水魚焿(焿)', price: 100 },
  { name: '浮水魚焿(飯)', price: 110 },
  { name: '浮水魚焿(麵)', price: 110 },
  { name: '浮水魚焿(米粉)', price: 110 },
  { name: '古早味肉焿(焿)', price: 80 },
  { name: '古早味肉焿(飯)', price: 90 },
  { name: '古早味肉焿(麵)', price: 90 },
  { name: '古早味肉焿(米粉)', price: 90 },
  { name: '乾擔仔麵', price: 50 },
  { name: '乾米粉', price: 50 },
  { name: '乾板條', price: 50 },
  { name: '肉燥飯', price: 50 },
  { name: '燙青菜', price: 50 },
  { name: '滷蛋', price: 15 },
]

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return
  const msg = event.message.text

  if (msg === '我的ID') {
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: '你的ID是：' + event.source.userId }]
  })
}
  if (msg === '菜單' || msg === '點餐') {
    const url = 'https://line-order-production.up.railway.app'
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `🐟 巷子裡 𩵚魠魚焿 線上點餐：\n\n${url}\n\n點擊連結即可選餐下單！` }]
    })
  }

  if (msg === '我的訂單') {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5')
    if (result.rows.length === 0) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '您還沒有任何訂單！' }]
      })
    }
    const text = result.rows.map(o => {
      const itemList = o.items.map(i => `${i.name} $${i.price}`).join('、')
      return `#${o.id} ${itemList} 共$${o.total_price} - ${o.status}`
    }).join('\n')
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `📦 最近訂單：\n\n${text}` }]
    })
  }

  const found = menu.find(i => msg.includes(i.name))
  if (found) {
    await pool.query(
      'INSERT INTO orders (customer_name, items, total_price) VALUES ($1, $2, $3)',
      ['LINE用戶', JSON.stringify([{ name: found.name, price: found.price }]), found.price]
    )
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `✅ 收到點餐！\n${found.name} $${found.price}\n請稍候！` }]
    })
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: '您好！輸入「菜單」取得點餐連結 🐟\n或輸入「我的訂單」查看訂單狀態' }]
  })
}

app.listen(3000, async () => {
  await initDB()
  console.log('伺服器啟動成功！')
})