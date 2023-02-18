require("chromedriver");
require("dotenv").config()
const { By, Builder, until } = require("selenium-webdriver");
const axios = require('axios')
const fs = require("fs").promises

const USER = process.env.USER
const PASS = process.env.PASS
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN
const PUSHOVER_USER = process.env.PUSHOVER_USER

const LAT = 45.523765
const LONG = -73.619439
const RADIUS = 9.26176
const PRICE = 2200
const MIN_AREA = 50

const PATH = `\
/marketplace/category/propertyrentals?\
maxPrice=${PRICE}&\
minAreaSize=${MIN_AREA}&\
exact=false&\
latitude=${LAT}&\
longitude=${LONG}&\
radius=${RADIUS}&\
propertyType=apartment-condo,house,townhouse&\
minBedrooms=2&\
sortBy=creation_time_descend
`

async function type(string, element) {
  for (let i = 0; i < string.length; i++) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200))
    element.sendKeys(string[i])
  }
}
function click(element) {
  return new Promise(resolve => {
    setTimeout(() => {
      return element.click().then(resolve)
    }, Math.random() * 200)
  })
}

async function getActuallyNew(els) {
  const existing = JSON.parse(await fs.readFile('./out.json'));
  return els.filter(({ id }) => !existing.includes(id))
}

async function writeFile(newIDs) {
  const existing = JSON.parse(await fs.readFile('./out.json'));
  await fs.writeFile('./out.json', JSON.stringify([...newIDs, ...existing]))
}

async function run() {
  const driver = await new Builder().forBrowser("chrome").build();
  const basic = `https://www.facebook.com${PATH}`
  await driver.get(`https://www.facebook.com/login`);
  username = driver.findElement(By.name("email"))
  password = driver.findElement(By.name("pass"))
  submit = driver.findElement(By.name("login"))
  await type(USER, username)
  await type(PASS, password)
  await click(submit)
  await driver.wait(until.elementLocated(By.css('[aria-label="Search Facebook"]')), 10 * 1000)
  await driver.get(basic)

  const xpath = `.//a[contains(@href,'/marketplace/item/')]`
  const els = await driver.findElements(By.xpath(xpath))
  const ids = await Promise.all(els.map(e => e.getAttribute('href').then(async href =>
  (
    {
      id: href.match(/\d+/)[0],
      title: await (await e.getText().then(t => t.replace('\n', ' - ').split('Montréal, QC')[0].split('C')[1]))
    }
  )
  )))

  const actuallyNew = await getActuallyNew(ids)
  await writeFile(actuallyNew.map(({ id }) => id))
  console.log("🚀  actuallyNew", actuallyNew)
  await actuallyNew.forEach(async ({ id, title }) => {
    const payload = {
      token: PUSHOVER_TOKEN,
      user: PUSHOVER_USER,
      message: `fb.com/marketplace/item/${id}`,
      title: `🏘️ ${title}`,
      url: `fb://marketplace_product_details?id=${id}`
    }
    console.log(payload)
    axios.post('https://api.pushover.net/1/messages.json', payload).catch(e => console.error(e))
    await new Promise(resolve => setTimeout(resolve, 1000))
  })
  driver.close()
}

run()

// for ((;;)) {yarn start; sleep 60}
