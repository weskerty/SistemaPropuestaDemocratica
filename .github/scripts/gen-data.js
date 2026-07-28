const OWNER = process.env.REPO_OWNER
const NAME = process.env.REPO_NAME
const TOKEN = process.env.GH_TOKEN
const CATEGORY = process.env.DISCUSSION_CATEGORY || ''
const DATA_DIR = 'Data'
const API = 'https://api.github.com/graphql'

const Q_LIST = `
query($owner:String!,$name:String!,$after:String){
  repository(owner:$owner,name:$name){
    discussions(first:50,after:$after,states:[OPEN],orderBy:{field:UPDATED_AT,direction:DESC}){
      pageInfo{ hasNextPage endCursor }
      nodes{
        id number title body author{ login avatarUrl }
        createdAt updatedAt url isAnswered
        category{ name emoji }
        reactionGroups{ content reactors{ totalCount } }
      }
    }
  }
}`

const Q_COMMENTS = `
query($owner:String!,$name:String!,$num:Int!,$after:String){
  repository(owner:$owner,name:$name){
    discussion(number:$num){
      comments(first:50,after:$after){
        pageInfo{ hasNextPage endCursor }
        nodes{
          id databaseId author{ login avatarUrl } body createdAt
          isAnswer replyTo{ databaseId }
          reactionGroups{ content reactors{ totalCount } }
          replies(first:50){
            pageInfo{ hasNextPage endCursor }
            nodes{
              id databaseId author{ login avatarUrl } body createdAt
              isAnswer replyTo{ databaseId }
              reactionGroups{ content reactors{ totalCount } }
            }
          }
        }
      }
    }
  }
}`

async function gql(query, variables) {
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      'User-Agent': 'propuestas-sync'
    },
    body: JSON.stringify({ query, variables })
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data
}

function reactMap(groups) {
  const m = {}
  for (const g of groups || []) {
    if (g.reactors.totalCount > 0) m[g.content] = g.reactors.totalCount
  }
  return m
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'propuesta'
}

async function fetchAllComments(num) {
  let after = null
  const out = []
  while (true) {
    const d = await gql(Q_COMMENTS, { owner: OWNER, name: NAME, num, after })
    const conn = d.repository.discussion.comments
    for (const c of conn.nodes) {
      out.push({
        id: c.databaseId,
        author: c.author ? c.author.login : null,
        avatar: c.author ? c.author.avatarUrl : null,
        body: c.body,
        createdAt: c.createdAt,
        isAnswer: c.isAnswer,
        reactions: reactMap(c.reactionGroups),
        replies: (c.replies.nodes || []).map(r => ({
          id: r.databaseId,
          author: r.author ? r.author.login : null,
          avatar: r.author ? r.author.avatarUrl : null,
          body: r.body,
          createdAt: r.createdAt,
          isAnswer: r.isAnswer,
          reactions: reactMap(r.reactionGroups)
        }))
      })
    }
    if (!conn.pageInfo.hasNextPage) break
    after = conn.pageInfo.endCursor
  }
  return out
}

async function fetchAllDiscussions() {
  let after = null
  const out = []
  while (true) {
    const d = await gql(Q_LIST, { owner: OWNER, name: NAME, after })
    const conn = d.repository.discussions
    for (const n of conn.nodes) out.push(n)
    if (!conn.pageInfo.hasNextPage) break
    after = conn.pageInfo.endCursor
  }
  return CATEGORY ? out.filter(x => x.category.name === CATEGORY) : out
}

async function main() {
  const fs = await import('node:fs/promises')
  await fs.mkdir(DATA_DIR, { recursive: true })

  const discussions = await fetchAllDiscussions()
  const seenFiles = new Set()
  const index = []

  for (const disc of discussions) {
    const comments = await fetchAllComments(disc.number)
    const slug = `${disc.number}-${slugify(disc.title)}`
    const file = `${DATA_DIR}/${slug}.json`
    seenFiles.add(`${slug}.json`)

    const payload = {
      number: disc.number,
      title: disc.title,
      author: disc.author ? disc.author.login : null,
      avatar: disc.author ? disc.author.avatarUrl : null,
      body: disc.body,
      url: disc.url,
      category: disc.category.name,
      categoryEmoji: disc.category.emoji,
      isAnswered: disc.isAnswered,
      createdAt: disc.createdAt,
      updatedAt: disc.updatedAt,
      reactions: reactMap(disc.reactionGroups),
      commentCount: comments.length,
      comments
    }

    await fs.writeFile(file, JSON.stringify(payload), 'utf8')

    index.push({
      number: disc.number,
      title: disc.title,
      slug,
      category: disc.category.name,
      categoryEmoji: disc.category.emoji,
      isAnswered: disc.isAnswered,
      updatedAt: disc.updatedAt,
      reactions: reactMap(disc.reactionGroups),
      commentCount: comments.length
    })
  }

  const existing = await fs.readdir(DATA_DIR).catch(() => [])
  for (const f of existing) {
    if (f === 'index.json') continue
    if (!seenFiles.has(f)) await fs.unlink(`${DATA_DIR}/${f}`)
  }

  index.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  await fs.writeFile(`${DATA_DIR}/index.json`, JSON.stringify(index), 'utf8')

  console.log(`Generadas ${index.length} propuestas abiertas`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
