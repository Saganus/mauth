On the other hand, authorized routes will support wildcards so you can determine which resources can each user request, without the need for long whitelists.

Also, due to the way routes are defined, you can "group them up" with scopes, so that commonly used scopes can be defined once and reused for many users, giving you the chance to completely customize a user's access policy.

For example:

    scopes : 
        [
            {
                name : "restricted",
                routes : ["/restricted"],
                methods : ["GET", "POST"]
            },
            {
                name : "user profile",
                routes : ["/users/:userId/**"],
                methods : ["GET", "POST", "PUT"]
            },
            {
                name : "user projects",
                routes : ["/projects/:userId_*/*"],
                methods : ["GET", "POST"]
            },
            {
                name : "logout user",
                routes : ["/logout/:userId"],
                methods : ["POST"]
            } 
        ]
        
With this policy a user will have authorized access with `GET` and `POST` to `/restricted` as well as to the profile page, which as you can see is defined with wildcards of two different types. One of them is a variable (:userId) which will be replaced with the corresponding value at mint time, and the second `/**` one indicates that the access is granted recursively, i.e. the user will have access to any route that starts with `/users/:userId` so that if more features are added under that prefix, the user will still have access to them.

In the next case, for the scope "user projects", the user is granted acces to anything that starts with `/projects/:userId` but only up to the first level. e.g. `/projects/<userId_projectId>/getDetails` but not `/projects/<userId_projectId>/files/<fileId>`, unlike in the previous case.

Finally, the user is only authorized to do a POST to `/logout/:userId` (or maybe this can be changed to `/logout` and enforce the correct userId to be logged out in the actual logout function)

## How to use the mAuth middleware?

To use mAuth, first install it from npm:

    npm install mauth
    
Then `require()` either the verifier or the mint:

    var mAuthVerifier       = require("mauth").mAuthVerifier;
    var mAuthMint           = require("mauth").mAuthMint;
    
### Using the verifier middleware

Set the verifier middleware before the requests are routed to their endpoints, so that it can restrict or grant access. You can optionally specify a public scope which will configure which API resources do not require any authorization to be requested (i.e. public endpoints):

    var publicScope = {
        GET : ["/", "/login"],
        POST : ["/login", "/register", "/resetPassword"]
    };

    router.use(getMacaroonSecret({collection: "ACEs"}));  // this is a helper method used to set req.macaroonSecret
    router.use(mAuthVerifier({serverId : serverId, publicScope : publicScope}));

**That's it! Nothing else is required to restrict access to an API endpoint with your specified policy!**

#### Set req.macaroonSecret

Note that for the verifier to work you need to set the macaroonSecret for each request, i.e. either set it to a fixed value or use a helper middleware to set the variable depending on e.g. a DB query result (in this example that's what `getMacaroonSecret({collection: "ACEs"})` is used for)

The macaroonSecret value is the same one used when the macaroon was first created. It allows the server to verify that the macaroon hasn't been tampered with (i.e. it's used to calculate the signature)

### Using the mint module

The mint module is used to create the macaroons needed to access a restricted API resource.

You will generally use the mint module with your existing login infrastructure, to generate the macaroons just after the user has been authenticated. 

In a typical login system, you will have something like this:

    // first we search for the user
    collection.findOne({userId : userId}) 
        .then(function(user){
            if(user !== null){  
                // if we find it we verify that the provided password is the correct one
                var isAuthenticated = scrypt.verifyKdfSync(Buffer.from(user.pass, "hex"), pass);
                
                if(isAuthenticated){
                    // if the user is authenticated we generate the macaroons according to the user policy
                    var userPolicy      = getUserPolicy(user.userId);
                    var macaroonSecret  = mAuthMint.calculateMacaroonSecret(user.macaroonSecret);
                    authMacaroons       = mAuthMint.mintMacaroons(userPolicy, location, macaroonSecret, user.identifier);
                    
                    // we return an array of four macaroons (one for each HTTP verb)
                    // that can be stored as cookies, localStorage or any other mechanism
                    resolve(authMacaroons);
                }
                else{
                    var error = new Error("Authentication failed");
                    reject(error);
                }
            }
            else{
                var error = new Error("User not found: " + userId);
                reject(error);
            }
        }).catch(function (error) {
            console.log(error);
            reject(error);
        });

That's it. One line (plus an optional calculation step for the secret, which can be replaced for whatever other function we want) and we generate the necessary proof-of-authorization pieces to access a restricted API protected by the mAuth verifier module.

Simple!

