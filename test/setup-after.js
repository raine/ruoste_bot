const { pgp } = require('../src/db')

afterAll(() => {
  pgp.end()
})
