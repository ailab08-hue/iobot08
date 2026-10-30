const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--project','tsconfig.json'],{stdio:'inherit'});
process.exit(result.status??1);
