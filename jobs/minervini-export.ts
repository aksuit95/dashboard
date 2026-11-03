import { exportMinerviniPublication } from "@/lib/sources/minervini-publication";

exportMinerviniPublication().then(result => {
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
