---
'@identizen/index': patch
---

`readBodyCapped` feeds Hono's parsed-body cache, so a route that parses the body after the signed or bearer middleware (an embedding host's own routes) still gets it; 0.6.0 consumed the stream and such routes failed with "Body has already been used".
