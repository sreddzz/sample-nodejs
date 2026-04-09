import express from 'express'
const app = express()

app.use(express.json())

const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
]

app.get('/', (req, res) => {
    res.send('Hello World!!!')
})

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() })
})

app.get('/users', (req, res) => {
    res.json(users)
})

app.get('/users/:id', (req, res) => {
    const user = users.find(u => u.id === parseInt(req.params.id))
    if (!user) {
        return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
})

app.post('/users', (req, res) => {
    const { name, email } = req.body
    if (!name || !email) {
        return res.status(400).json({ error: 'name and email are required' })
    }
    const newUser = { id: users.length + 1, name, email }
    users.push(newUser)
    res.status(201).json(newUser)
})

export default app