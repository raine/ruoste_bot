const nockBack = require('nock').back
nockBack.fixtures = __dirname + '/test/data/'
nockBack.setMode('record')

process.env.DATABASE_URL = 'postgres://localhost:5432/ruoste_bot_test'
