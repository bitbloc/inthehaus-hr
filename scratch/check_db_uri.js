require('dotenv').config({ path: '.env.local' });
const uri = process.env.IGCCSVC_DB || '';
console.log("IGCCSVC_DB starts with postgres?:", uri.startsWith('postgres://') || uri.startsWith('postgresql://'));
