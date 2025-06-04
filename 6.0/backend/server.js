/* ───────────────────────────────────────────────────────────
 * Modern façade around the untouched legacy implementation.
 * Place the _original_ file beside this one as legacy.js or
 * adjust `require` below.  Nothing inside legacy.js changes.
 * ──────────────────────────────────────────────────────────*/
import express           from 'express';
import cors              from 'cors';
import helmet            from 'helmet';
import morgan            from 'morgan';
import rateLimit         from 'express-rate-limit';
import swaggerUi         from 'swagger-ui-express';
import swaggerJsdoc      from 'swagger-jsdoc';
import axios             from 'axios';
import jwt               from 'jsonwebtoken';
import NodeCache         from 'node-cache';
import path              from 'path';
import { fileURLToPath } from 'url';

import legacy            from './legacy.js';         // ◀️ your un-touched code

/* ——————————————————— env / util ——————————————————— */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PORT       = process.env.PORT || 8080;
const ORIGINS    = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);

const app = express();
app.use(express.json({limit: '2mb'}));
app.use(cors({origin: ORIGINS.length ? ORIGINS : true, credentials: true}));
app.use(helmet());
app.use(morgan('combined'));

/* ——————————————————— auth ——————————————————— */
/* No Firebase-Admin — we validate ID-tokens manually with Google’s JWKS */
const jwkCache = new NodeCache({stdTTL: 3600});      // 1 h
const FIREBASE_PROJECT = process.env.FB_PROJECT_ID;  // same as client config

async function getPublicKey(kid){
  const cached = jwkCache.get(kid);
  if (cached) return cached;
  const {data: keys} = await axios.get(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
    {timeout: 5_000}
  );
  jwkCache.mset(Object.entries(keys).map(([k,v])=>({key:k,val:v})));
  return keys[kid];
}

async function auth(req,res,next){
  const hdr = req.headers.authorization||'';
  if(!hdr.startsWith('Bearer ')) return res.status(401).json({error:'Missing token'});
  try{
    const token = hdr.slice(7);
    const {header:{kid}} = jwt.decode(token,{complete:true});
    const key   = await getPublicKey(kid);
    const decoded = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT}`,
      audience: FIREBASE_PROJECT,
    });
    req.user = decoded;
    next();
  }catch(err){
    console.error(err);
    res.status(401).json({error:'Invalid token'});
  }
}

/* ——————————————————— rate-limit & error wrapper ——————————————————— */
const limiter = rateLimit({windowMs: 60_000, max: 60});
app.use('/api/', limiter);

const asyncWrap = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

/* ——————————————————— API routes ——————————————————— */
const router = express.Router();
router.use(auth);                // 🔐 All endpoints are protected

/* Expose *exactly* the same behaviours the socket / CLI had */
router.post('/task/start',      asyncWrap(async (req,res)=>res.json(await legacy.startTask(req.body))));
router.get ('/task/:id/status', asyncWrap(async (req,res)=>res.json(await legacy.getStatus(req.params.id))));
router.get ('/report/:id',      asyncWrap(async (req,res)=>res.json(await legacy.getReport(req.params.id))));
router.get ('/screenshot/:id',  asyncWrap(async (req,res)=>{
  const file = await legacy.getScreenshotPath(req.params.id);
  res.sendFile(path.resolve(file));
}));
/* …add every other public method from legacy.js the same way… */

app.use('/api', router);

/* ——————————————————— Swagger ——————————————————— */
const spec = swaggerJsdoc({
  definition:{
    openapi:'3.1.0',
    info:{title:'MCP API',version:'1.0.0'},
    security:[{bearerAuth:[]}],
    components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}}},
  },
  apis:[__filename],           // Autogen from JSDoc below, or add yml files
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

/**
 * @swagger
 * /api/task/start:
 *   post:
 *     summary: Start a new MCP task
 *     requestBody:
 *       required: true
 *       content: {application/json: {schema: {$ref:'#/components/schemas/TaskRequest'}}}
 *     responses:
 *       200: {description: Success}
 *       4XX: {description: Client error}
 */
/* …repeat for every route… */

/* ——————————————————— static assets & fallback ——————————————————— */
app.use('/public', express.static(path.join(__dirname,'public')));

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(err.status||500).json({error:err.message||'Server error'});
});

/* ——————————————————— launch ——————————————————— */
app.listen(PORT, ()=>console.log(`⚡️ MCP API listening on :${PORT}`));
