require("chromedriver");
require("dotenv").config()
const { By, Builder, until } = require("selenium-webdriver");
const axios = require('axios')
const FormData = require('form-data')
const fs = require("fs").promises
const { createWriteStream } = require("fs")
const config = require('./config.json')

const USER = process.env.FB_USER
const PASS = process.env.FB_PASS
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN
const PUSHOVER_USER = process.env.PUSHOVER_USER

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

const ITEM_XPATH = `.//a[contains(@href,'/marketplace/item/')]`

const downloadImage = async (url, image_path) => {
  let f
  try {
    f = await fs.open(image_path, 'w')
    const ws = createWriteStream(image_path)
    return axios({
      url,
      responseType: 'stream',
    }).then(
      response =>
        new Promise((resolve, reject) => {
          response.data
            .pipe(ws)
            .on('finish', () => resolve())
            .on('error', e => reject(e));
        }),
    ).finally(() => {
      f?.close()
    })
  } finally {
    await f?.close()
  }
}

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
  const existing = JSON.parse(await fs.readFile('./tmp/out.json'));
  return els.filter(({ id }) => !existing.includes(id))
}

async function writeFile(newIDs) {
  const existing = JSON.parse(await fs.readFile('./tmp/out.json'));
  await fs.writeFile('./out.json', JSON.stringify([...newIDs, ...existing]))
}

async function loadAndSetCookies(driver) {
  const cookies = JSON.parse(await fs.readFile('./tmp/cookies.json'));
  await driver.manage().deleteAllCookies()

  await driver.sendDevToolsCommand("Network.enable")
  for (const c of cookies) {
    await driver.sendDevToolsCommand("Network.setCookie", c)
  }
  await driver.sendDevToolsCommand("Network.disable")
}

async function writeCookies(driver) {
  const cookies = await driver.manage().getCookies()
  await fs.writeFile('./tmp/cookies.json', JSON.stringify(cookies.map(c => ({
    ...c,
    domain: "https://www.facebook.com"
  }))))
}

async function isOnHomepage(driver) {
  return driver.findElements(By.css('[aria-label="Search Facebook"]')).then(els => els.length > 0)
}

const sendNoti = async (_data) => {
  const form = new FormData()
  const data = {
    token: PUSHOVER_TOKEN,
    user: PUSHOVER_USER,
    ..._data,
  }
  let img
  try {
    img = await fs.readFile(`./images/${data.id}.jpg`)
    form.append('attachment', img, { filename: `${data.id}.jpg` });
    Object.entries(data).forEach(([key, value]) => {
      form.append(key, value)
    })
  } catch (e) {
    console.error(e)
  }
  try {
    return img
      ? axios.post('https://api.pushover.net/1/messages.json', form, { headers: form.getHeaders() })
      : axios.post('https://api.pushover.net/1/messages.json', data)
  } catch (e) {
    console.error(e)
  }
}

// =======================================================================================

async function run() {
  const driver = await new Builder().forBrowser("chrome").build();

  await loadAndSetCookies(driver)
  await driver.get(`https://www.facebook.com`);
  await driver.navigate().refresh()

  if (await isOnHomepage(driver) === false) {
    username = driver.findElement(By.name("email"))
    password = driver.findElement(By.name("pass"))
    submit = driver.findElement(By.name("login"))
    await type(USER, username)
    await type(PASS, password)
    await click(submit)
    await driver.wait(until.elementLocated(By.css('[aria-label="Search Facebook"]')), 10 * 1000)
  }


  const basic = `https://www.facebook.com${PATH}`

  while (true) {
    try {
      await driver.get(basic)
      await writeCookies(driver)
      await driver.wait(until.elementLocated(By.css('[aria-label="Search Marketplace"]')), 10 * 1000)

      const _els = await driver.findElements(By.xpath(ITEM_XPATH))
      const els = await Promise.all(_els.map(e => e.getAttribute('href').then(async href => {
        const img = await e.findElement(By.css('img')).then(img => img.getAttribute('src'))
        const id = href.match(/\d+/)[0]
        await downloadImage(img, './images/' + id + '.jpg')
        const sep = ' - '
        const text = await e.getText().then(t => {
          return t.replace('\n', sep).replace(/^C+/, '').replace('\n', sep)
        })
        const tokens = text.split(sep)
        const price = tokens[0] ?? 'ERROR_PRICE'
        const loc = tokens[tokens.length - 1] ?? "ERROR_LOC"
        const name = tokens.slice(1, tokens.length - 1).join(sep) ?? "ERROR_NAME"
        return ({ id: href.match(/\d+/)[0], title: `${price} - ${loc}`, message: name })
      }
      )))

      const actuallyNew = await getActuallyNew(els)
      await writeFile(actuallyNew.map(({ id }) => id))
      console.log("🚀  actuallyNew", actuallyNew)
      for (const { id, title, message } of actuallyNew) {
        await sendNoti({
          id,
          title: `🏘️ ${title} `,
          message,
          url: `fb://marketplace_product_details?id=${id}`,
        })

        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      await new Promise(resolve => setTimeout(resolve, Math.random() * 60 * 1000 + 60 * 1000))

      let waited = 0
      const randomTime = Math.random() * 60000 + 60000
      while (waited < randomTime) {
        const toWait = Math.random() * 5 * 1000 + 5 * 1000
        await new Promise(resolve => setTimeout(resolve, toWait))
        waited += toWait
      }
    } catch (err) {
      console.error(err)
      break
    }
  }
  driver.close()
}


run()
