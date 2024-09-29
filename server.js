// using express JS
var express = require("express");
var app = express();

// express formidable is used to parse the form data values
var formidable = require("express-formidable");
app.use(formidable({
    // max upload file size 300 MB
    "maxFileSize": 300 * 1024 * 1024
}));

var jwt = require("jsonwebtoken");
var accessTokenSecret = "1234567890AdminTokenSecret";

// use mongo DB as database
var mongodb = require("mongodb");
var mongoClient = mongodb.MongoClient;

// the unique ID for each mongo DB document
var ObjectId = mongodb.ObjectId;

// receiving http requests
var httpObj = require("http");
var http = httpObj.createServer(app);

// to encrypt/decrypt passwords
var bcrypt = require("bcrypt");

// to store files
var fileSystem = require("fs");

// module to create ZIP files
var zipper = require('zip-local');

// to send emails
var nodemailer = require("nodemailer");

// for realtime communication
const socketIO = require("socket.io")(http, {
    cors: {
        origin: "*"
    }
});

// to compress image
const compressImages = require("compress-images");

// to start the session
var session = require("express-session");
app.use(session({
    secret: 'secret key',
    resave: false,
    saveUninitialized: false
}));

// define the publically accessible folders
app.use("/public/uploads", express.static(__dirname + "/public/uploads"));
app.use("/public/wysiwyg", express.static(__dirname + "/public/wysiwyg"));
app.use("/public/admin", express.static(__dirname + "/public/admin"));
app.use("/public/css", express.static(__dirname + "/public/css"));
app.use("/public/js", express.static(__dirname + "/public/js"));
app.use("/public/font-awesome-4.7.0", express.static(__dirname + "/public/font-awesome-4.7.0"));
app.use('/img', express.static(__dirname + '/views/img'));

// using EJS as templating engine
app.set("view engine", "ejs");

// main URL of website
var mainURL = "https://cloudbytecollective.pro";

// to remove folder and all sub-directories in it
var rimraf = require("rimraf");

// setup SMTP for sending mails
var nodemailerFrom = "miliatansinyee@gmail.com";
var nodemailerObject = {
    service: "gmail",
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: "cloudbytecollective@gmail.com",
        pass: "isprbvyihlduhsep"
    }
};

var requestModule = require("request");

const admin = require("./modules/admin");
admin.init(app, express);
const functions = require("./modules/functions");

// global database object
var database = null;

// app middleware to attach main URL and user object with each request
app.use(function (request, result, next) {
    request.mainURL = mainURL;
    request.isLogin = (typeof request.session.user !== "undefined");
    request.user = request.session.user;

    // continue the request
    next();
});

// start the http server
http.listen(4000, function () {
    console.log("Server started at " + mainURL);

    // connect with mongo DB server
    mongoClient.connect("mongodb+srv://CloudByte:JYG8aTc5iGF8OUwv@cloudbyte-db.9bu1yf3.mongodb.net/?retryWrites=true&w=majority&appName=CloudByte-db", {
        useUnifiedTopology: true
    }, function (error, client) {

        // connect database (it will automatically create the database if not exists)
        database = client.db("file_transfer");
        console.log("Database connected.");

        var socketUsers = [];
        
        socketIO.on("connection", function (socket) {
            console.log("User connected: " + socket.id);

            socket.on("logged_in", function (user_id) {
                socketUsers[user_id] = socket.id;
                admin.socketUsers = socketUsers;
            });
        });

        admin.setData(database, socketIO, socketUsers);

        app.post("/ForceDeleteFile", async function (request, result) {
            if (request.session.user) {

                const _id = request.fields._id;

                var user = await database.collection("users").findOne({
                    $and: [{
                        "_id": ObjectId(request.session.user._id)
                    }, {
                        "trashCan._id": ObjectId(_id)
                    }]
                });

                if (user == null) {
                    request.session.status = "error";
                    request.session.message = "File does not exists.";
                    result.redirect("/TrashCan");

                    return false;
                }

                var file = null;
                for (var a = 0; a < user.trashCan.length; a++) {
                    if (user.trashCan[a]._id.toString() == _id) {
                        file = user.trashCan[a];
                        break;
                    }
                }
                if (file == null) {
                    request.session.status = "error";
                    request.session.message = "File does not exists.";
                    result.redirect("/TrashCan");

                    return false;
                }

                await database.collection("users").updateOne({
                    $and: [{
                        "_id": ObjectId(request.session.user._id)
                    }, {
                        "trashCan._id": ObjectId(_id)
                    }]
                }, {
                    $pull: {
                        "trashCan": {
                            "_id": ObjectId(_id)
                        }
                    }
                });

                try {
                    fileSystem.unlinkSync(file.filePath);
                } catch (exp) {
                    
                }

                request.session.status = "success";
                request.session.message = "File has been deleted permanently.";
                result.redirect("/TrashCan");

                return false;
            }

            result.redirect("/Login");
        });

        app.post("/RecoverFile", async function (request, result) {
            if (request.session.user) {

                const _id = request.fields._id;

                var user = await database.collection("users").findOne({
                    $and: [{
                        "_id": ObjectId(request.session.user._id)
                    }, {
                        "trashCan._id": ObjectId(_id)
                    }]
                });

                if (user == null) {
                    request.session.status = "error";
                    request.session.message = "File does not exists.";
                    result.redirect("/TrashCan");

                    return false;
                }

                var file = null;
                for (var a = 0; a < user.trashCan.length; a++) {
                    if (user.trashCan[a]._id.toString() == _id) {
                        file = user.trashCan[a];
                        break;
                    }
                }
                if (file == null) {
                    request.session.status = "error";
                    request.session.message = "File does not exists.";
                    result.redirect("/TrashCan");

                    return false;
                }

                // check if upload limit exceeded
                const fileSize = file.size;
                if (fileSize > user.remainingData) {
                    request.session.status = "error";
                    request.session.message = "Kindly buy more data to upload this file.";
                    result.redirect("/TrashCan");

                    return false;
                }

                // subtract from user remaining data
                user.remainingData = user.remainingData - fileSize;

                await database.collection("users").updateOne({
                    $and: [{
                        "_id": ObjectId(request.session.user._id)
                    }, {
                        "trashCan._id": ObjectId(_id)
                    }]
                }, {
                    $pull: {
                        "trashCan": {
                            "_id": ObjectId(_id)
                        }
                    }
                });

                await database.collection("users").updateOne({
                    "_id": ObjectId(request.session.user._id)
                }, {
                    $set: {
                        "remainingData": user.remainingData
                    },
                    $push: {
                        "uploaded": file
                    }
                });

                request.session.status = "success";
                request.session.message = "File has been recovered.";
                result.redirect("/TrashCan");

                return false;
            }

            result.redirect("/Login");
        });

        app.get("/TrashCan", async function (request, result) {
            if (request.session.user) {

                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                result.render("TrashCan", {
                    "request": request,
                    "trashCan": user.trashCan
                });
                return true;
            }

            result.redirect("/Login");
        });

        // search files
        app.get("/Search", async function (request, result) {
            const search = request.query.search;

            if (request.session.user) {
                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });
                var fileUploaded = await functions.recursiveSearch(user.uploaded, search);
                var fileShared = await functions.recursiveSearchShared(user.sharedWithMe, search);

                // check if file is uploaded or shared with user
                if (fileUploaded == null && fileShared == null) {
                    request.status = "error";
                    request.message = "File '" + search + "' is neither uploaded nor shared with you.";

                    result.render("Search", {
                        "request": request
                    });
                    return false;
                }

                var file = (fileUploaded == null) ? fileShared : fileUploaded;
                file.isShared = (fileUploaded == null);
                result.render("Search", {
                    "request": request,
                    "file": file
                });

                return false;
            }

            result.redirect("/Login");
        });

        // remove shared access
        app.post("/RemoveSharedAccess", async function (request, result) {
            const _id = request.fields._id;

            if (request.session.user) {
                const user = await database.collection("users").findOne({
                    $and: [{
                        "sharedWithMe._id": ObjectId(_id)
                    }, {
                        "sharedWithMe.sharedBy._id": ObjectId(request.session.user._id)
                    }]
                });

                // remove from array
                for (var a = 0; a < user.sharedWithMe.length; a++) {
                    if (user.sharedWithMe[a]._id == _id) {
                        user.sharedWithMe.splice(a, 1);
                    }
                }

                await database.collection("users").findOneAndUpdate({
                    $and: [{
                        "sharedWithMe._id": ObjectId(_id)
                    }, {
                        "sharedWithMe.sharedBy._id": ObjectId(request.session.user._id)
                    }]
                }, {
                    $set: {
                        "sharedWithMe": user.sharedWithMe
                    }
                });

                request.session.status = "success";
                request.session.message = "Shared access has been removed.";

                const backURL = request.header('Referer') || '/';
                result.redirect(backURL);
                return false;
            }

            result.redirect("/Login");
        });

        // get users whom file has been shared
        app.post("/GetFileSharedWith", async function (request, result) {
            const _id = request.fields._id;

            if (request.session.user) {
                const tempUsers = await database.collection("users").find({
                    $and: [{
                        "sharedWithMe.file._id": ObjectId(_id)
                    }, {
                        "sharedWithMe.sharedBy._id": ObjectId(request.session.user._id)
                    }]
                }).toArray();

                var users = [];
                for (var a = 0; a < tempUsers.length; a++) {
                    var sharedObj = null;
                    for (var b = 0; b < tempUsers[a].sharedWithMe.length; b++) {
                        if (tempUsers[a].sharedWithMe[b].file._id == _id) {
                            sharedObj = {
                                "_id": tempUsers[a].sharedWithMe[b]._id,
                                "sharedAt": tempUsers[a].sharedWithMe[b].createdAt,
                            };
                        }
                    }
                    users.push({
                        "_id": tempUsers[a]._id,
                        "name": tempUsers[a].name,
                        "email": tempUsers[a].email,
                        "sharedObj": sharedObj
                    });
                }

                result.json({
                    "status": "success",
                    "message": "Record has been fetched.",
                    "users": users
                });
                return false;
            }

            result.json({
                "status": "error",
                "message": "Please login to perform this action."
            });
        });

        // get all files shared with logged-in user
        app.get("/SharedWithMe/:_id?", async function (request, result) {
            const _id = request.params._id;
            if (request.session.user) {

                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                var files = null;
                var folderName = "";
                if (typeof _id == "undefined") {
                    files = user.sharedWithMe;
                } 

                if (files == null) {
                    request.status = "error";
                    request.message = "Directory not found.";
                    result.render("Error", {
                        "request": request
                    });
                    return false;
                }

                result.render("SharedWithMe", {
                    "request": request,
                    "files": files,
                    "_id": _id
                });
                return false;
            }

            result.redirect("/Login");
        });

        // share the file with the user
        app.post("/Share", async function (request, result) {
            const _id = request.fields._id;
            const type = request.fields.type;
            const email = request.fields.email;

            if (request.session.user) {
                var user = await database.collection("users").findOne({
                    "email": email
                });

                if (user == null) {
                    request.session.status = "error";
                    request.session.message = "User " + email + " does not exists.";
                    result.redirect("/MyUploads");

                    return false;
                }

                if (!user.isVerified) {
                    request.session.status = "error";
                    request.session.message = "User " + user.name + " account is not verified.";
                    result.redirect("/MyUploads");

                    return false;
                }

                var me = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                var file = null;
                file = await functions.recursiveGetFile(me.uploaded, _id);

                if (file == null) {
                    request.session.status = "error";
                    request.session.message = "File does not exists.";
                    result.redirect("/MyUploads");

                    return false;
                }
                file._id = ObjectId(file._id);

                const sharedBy = me;

                await database.collection("users").findOneAndUpdate({
                    "_id": user._id
                }, {
                    $push: {
                        "sharedWithMe": {
                            "_id": ObjectId(),
                            "file": file,
                            "sharedBy": {
                                "_id": ObjectId(sharedBy._id),
                                "name": sharedBy.name,
                                "email": sharedBy.email
                            },
                            "createdAt": new Date().getTime()
                        }
                    }
                });

                request.session.status = "success";
                request.session.message = "File has been shared with " + user.name + ".";
                
                const backURL = request.header("Referer") || "/";
                result.redirect(backURL);
                return false;
            }

            result.redirect("/Login");
        });

        // get user for confirmation
        app.post("/GetUser", async function (request, result) {
            const email = request.fields.email;

            if (request.session.user) {
                var user = await database.collection("users").findOne({
                    "email": email
                });

                if (user == null) {
                    result.json({
                        "status": "error",
                        "message": "User " + email + " does not exists."
                    });
                    return false;
                }

                if (!user.isVerified) {
                    result.json({
                        "status": "error",
                        "message": "User " + user.name + " account is not verified."
                    });
                    return false;
                }

                result.json({
                    "status": "success",
                    "message": "Data has been fetched.",
                    "user": {
                        "_id": user._id,
                        "name": user.name,
                        "email": user.email
                    }
                });
                return false;
            }

            result.json({
                "status": "error",
                "message": "Please login to perform this action."
            });
            return false;
        });


        // delete uploaded file
        app.post("/DeleteFile", async function (request, result) {
            const _id = request.fields._id;

            if (request.session.user) {
                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                // free up the space so user can upload more
                var file = functions.recursiveGetFile(user.uploaded, _id);
                user.remainingData += file.size;

                var updatedArray = await functions.removeFileReturnUpdated(user.uploaded, _id);
                for (var a = 0; a < updatedArray.length; a++) {
                    updatedArray[a]._id = ObjectId(updatedArray[a]._id);
                }

                await database.collection("users").updateOne({
                    "_id": ObjectId(request.session.user._id)
                }, {
                    $set: {
                        "remainingData": user.remainingData,
                        "uploaded": updatedArray
                    },

                    $push: {
                        "trashCan": file
                    }
                });

                // Delete the file
                fileSystem.unlink(file.filePath, function (err) {
                    if (err) throw err;
                    console.log('File deleted!');
                });

                const backURL = request.header('Referer') || '/';
                result.redirect(backURL);
                return false;
            }

            result.redirect("/Login");
        });

        // download file
        app.post("/DownloadFile", async function (request, result) {
            const _id = request.fields._id;

            var link = await database.collection("public_links").findOne({
                "file._id": ObjectId(_id)
            });

            if (link != null) {
                fileSystem.readFile(link.file.filePath, async function (error, data) {

                    // increment the downloads
                    link.downloads++;
                    await database.collection("public_links").findOneAndUpdate({
                        "file._id": ObjectId(_id)
                    }, {
                        $set: {
                            "downloads": link.downloads
                        }
                    });

                    result.json({
                        "status": "success",
                        "message": "Data has been fetched.",
                        "arrayBuffer": data,
                        "fileType": link.file.type,
                        "fileName": link.file.name
                    });
                });
                return false;
            }

            if (request.session.user) {

                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                var fileUploaded = await functions.recursiveGetFile(user.uploaded, _id);
                var fileShared = await functions.recursiveGetSharedFile(user.sharedWithMe, _id);
                
                if (fileUploaded == null && fileShared == null) {
                    result.json({
                        "status": "error",
                        "message": "File is neither uploaded nor shared with you."
                    });
                    return false;
                }

                var file = (fileUploaded == null) ? fileShared : fileUploaded;
                var CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
                var buffer = Buffer.alloc(CHUNK_SIZE);
                var bufferArr = [];
                var totalSizeRead = 0;

                // Read file stats
                const userSocketID = socketUsers[request.session.user._id];

                console.log(file.filePath);

                fileSystem.open(file.filePath, 'r', function(err, fd) {
                    if (err) throw err;
                    function readNextChunk() {
                        fileSystem.read(fd, buffer, 0, CHUNK_SIZE, null, function(err, nread) {
                            if (err) throw err;

                            if (nread === 0) {
                                // done reading file, do any necessary finalization steps

                                socketIO.to(userSocketID).emit("download_completed", {
                                    "fileType": file.type,
                                    "fileName": file.name
                                });

                                fileSystem.close(fd, function(err) {
                                    if (err) throw err;
                                });

                                result.json({
                                    "status": "success",
                                    "message": "Data has been fetched."
                                });
                                return;
                            }

                            var data;
                            if (nread < CHUNK_SIZE) {
                                data = buffer.slice(0, nread);
                            } else {
                                data = buffer;
                            }

                            if (totalSizeRead < file.size) {
                                socketIO.to(userSocketID).emit("download_chunk_received", data);
                                
                                bufferArr.push(data);
                                totalSizeRead += CHUNK_SIZE;
                                
                                readNextChunk();
                            }
                            // do something with `data`, then call `readNextChunk();`
                        });
                    }
                    readNextChunk();
                });

                return false;
            }

            result.json({
                "status": "error",
                "message": "Please login to perform this action."
            });
            return false;
        });


        // view all files uploaded by logged-in user
        app.get("/MyUploads/:_id?", async function (request, result) {
            const _id = request.params._id;
            const accessToken = request.query.accessToken;
            const userId = request.query.user_id;

            if (accessToken != null && userId != null) {
                var admin = await database.collection("admin").findOne({
                    "accessToken": accessToken
                });

                if (admin != null) {

                    var user = await database.collection("users").findOne({
                        "_id": ObjectId(userId)
                    });

                    var fileObj = await functions.recursiveGetFile(user.uploaded, _id);

                    if (fileObj == null) {
                        request.status = "error";
                        request.message = "File not found.";
                        result.render("Error", {
                            "request": request
                        });
                        return false;
                    }

                    uploaded = fileObj;
                    createdAt = fileObj.createdAt;

                    if (uploaded == null) {
                        request.status = "error";
                        request.message = "Directory not found.";
                        result.render("Error", {
                            "request": request
                        });
                        return false;
                    }

                    result.render("MyUploads", {
                        "request": request,
                        "uploaded": uploaded,
                        "_id": _id,
                        "createdAt": createdAt
                    });
                    return false;
                }
            }

            if (request.session.user) {

                var user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                var uploaded = null;
                var createdAt = "";
                uploaded = user.uploaded;

                if (uploaded == null) {
                    request.status = "error";
                    request.message = "Directory not found.";
                    result.render("Error", {
                        "request": request
                    });
                    return false;
                }

                result.render("MyUploads", {
                    "request": request,
                    "uploaded": uploaded,
                    "_id": _id,
                    "createdAt": createdAt
                });
                return false;
            }

            result.redirect("/Login");
        });

	    const crypto = require("crypto");
        const fileSystem = require("fs");
        const path = require("path");
        const zlib = require("zlib");
        const { ObjectId } = require("mongodb");
        const { split, combine } = require("shamir");

        const algorithm = "aes-256-cbc";
        const secretKey = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const MAX_COMPRESSION_SIZE = 300 * 1024 * 1024; // 300MB in bytes

        // Split the secret key into shares
        const shares = split(3, 2, secretKey); // 3 shares, 2 required to reconstruct

        function compressAndEncryptFile(filePath, encryptedFilePath, shouldCompress) {
            const gzip = zlib.createGzip();
            const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
            const input = fileSystem.createReadStream(filePath);
            const output = fileSystem.createWriteStream(encryptedFilePath);

            if (shouldCompress) {
                input.pipe(gzip).pipe(cipher).pipe(output);
            } else {
                input.pipe(cipher).pipe(output);
            }

            return new Promise((resolve, reject) => {
                output.on("finish", () => resolve(true));
                output.on("error", (err) => reject(err));
            });
        }

        function decryptAndDecompressFile(encryptedFilePath, decryptedFilePath, wasCompressed) {
            // Combine the shares to reconstruct the key
            const reconstructedKey = combine(shares.slice(0, 2)); // Using 2 of the shares to reconstruct

            const decipher = crypto.createDecipheriv(algorithm, reconstructedKey, iv);
            const gunzip = zlib.createGunzip();
            const input = fileSystem.createReadStream(encryptedFilePath);
            const output = fileSystem.createWriteStream(decryptedFilePath);

            if (wasCompressed) {
                input.pipe(decipher).pipe(gunzip).pipe(output);
            } else {
                input.pipe(decipher).pipe(output);
            }

            return new Promise((resolve, reject) => {
                output.on("finish", () => resolve(true));
                output.on("error", (err) => reject(err));
            });
        }

        app.post("/UploadFile", async function (request, result) {
            if (request.session.user) {
                const compression = request.fields.compression;
                const user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id)
                });

                if (request.files.file.size > 0) {
                    const type = request.files.file.type;
                    const _id = request.fields._id;

                    // Check if upload limit exceeded
                    const fileSize = request.files.file.size;
                    if (fileSize > user.remainingData) {
                        request.status = "error";
                        request.message = "Limit exceeded.";
                        result.render("Error", { "request": request });
                        return false;
                    }

                    // Subtract from user remaining data
                    user.remainingData -= fileSize;

                    const uploadedObj = {
                        "_id": ObjectId(),
                        "size": fileSize,
                        "name": request.files.file.name,
                        "type": type,
                        "filePath": "",
                        "createdAt": new Date().getTime(),
                        "wasCompressed": fileSize <= MAX_COMPRESSION_SIZE
                    };

                    const currentTimestamp = new Date().getTime();
                    const filePath = path.join("uploads", currentTimestamp + "-" + request.files.file.name);
                    const encryptedFilePath = path.join("public/uploads", user.email, currentTimestamp + "-" + request.files.file.name + ".enc");

                    uploadedObj.filePath = encryptedFilePath;

                    if (!fileSystem.existsSync(path.join("public/uploads", user.email))) {
                        fileSystem.mkdirSync(path.join("public/uploads", user.email), { recursive: true });
                    }

                    // Compress (if applicable), encrypt, and write the file
                    await compressAndEncryptFile(request.files.file.path, encryptedFilePath, uploadedObj.wasCompressed);

                    // Store the shares securely (this is just an example; adapt as necessary)
                    user.secretShares = shares.map(share => share.toString('hex'));

                    // Update the user data in the database
                    await database.collection("users").updateOne(
                        { "_id": ObjectId(request.session.user._id) },
                        {
                            $set: { "remainingData": user.remainingData, "secretShares": user.secretShares },
                            $push: { "uploaded": uploadedObj }
                        }
                    );

                    // Delete the original file
                    fileSystem.unlink(request.files.file.path, function (err) {
                        if (err) throw err;
                        console.log('Original file deleted!');
                    });

                    result.redirect("/MyUploads/" + _id);
                } else {
                    request.status = "error";
                    request.message = "Please select a valid image.";
                    result.render("Error", { "request": request });
                    return false;
                }
            } else {
                result.redirect("/Login");
            }
        });

        app.get("/DownloadFile/:fileId", async function (request, result) {
            if (request.session.user) {
                const fileId = request.params.fileId;
                const user = await database.collection("users").findOne({
                    "_id": ObjectId(request.session.user._id),
                    "uploaded._id": ObjectId(fileId)
                });

                if (!user) {
                    request.status = "error";
                    request.message = "File not found.";
                    result.render("Error", { "request": request });
                    return false;
                }

                const file = user.uploaded.find(f => f._id.equals(ObjectId(fileId)));
                const encryptedFilePath = file.filePath;
                const decryptedFilePath = path.join("temp", file.name);

                // Reconstruct the secret key using the shares stored in the user document
                const storedShares = user.secretShares.map(share => Buffer.from(share, 'hex'));
                const reconstructedKey = combine(storedShares.slice(0, 2)); // Adjust as necessary

                // Decrypt and decompress (if applicable) the file for download
                await decryptAndDecompressFile(encryptedFilePath, decryptedFilePath, file.wasCompressed);

                // Send the decrypted file for download
                result.download(decryptedFilePath, async function (err) {
                    if (err) {
                        console.log(err);
                        return false;
                    } else {
                        // After download, compress (if applicable) and re-encrypt the file and store it back
                        await compressAndEncryptFile(decryptedFilePath, encryptedFilePath, file.wasCompressed);

                        // Optionally delete the decrypted file from the temp folder
                        fileSystem.unlink(decryptedFilePath, function (err) {
                            if (err) throw err;
                            console.log('Decrypted file deleted after re-encryption!');
                        });
                    }
                });
            } else {
                result.redirect("/Login");
            }
        });

        // reset password
        app.post("/ResetPassword", async function (request, result) {
            var email = request.fields.email;
            var reset_token = request.fields.reset_token;
            var new_password = request.fields.new_password;
            var confirm_password = request.fields.confirm_password;

            if (new_password != confirm_password) {
                request.status = "error";
                request.message = "Password does not match.";

                result.render("ResetPassword", {
                    "request": request,
                    "email": email,
                    "reset_token": reset_token
                });
                
                return false;
            }

            var user = await database.collection("users").findOne({
                $and: [{
                    "email": email,
                }, {
                    "reset_token": parseInt(reset_token)
                }]
            });

            if (user == null) {
                request.status = "error";
                request.message = "Email does not exists. Or recovery link is expired.";

                result.render("ResetPassword", {
                    "request": request,
                    "email": email,
                    "reset_token": reset_token
                });
                
                return false;
            }

            bcrypt.hash(new_password, 10, async function (error, hash) {
                await database.collection("users").findOneAndUpdate({
                    $and: [{
                        "email": email,
                    }, {
                        "reset_token": parseInt(reset_token)
                    }]
                }, {
                    $set: {
                        "reset_token": "",
                        "password": hash
                    }
                });

                request.status = "success";
                request.message = "Password has been changed. Please try login again.";

                result.render("Login", {
                    "request": request
                });

            });
        });

        // show page to reset the password
        app.get("/ResetPassword/:email/:reset_token", async function (request, result) {

            var email = request.params.email;
            var reset_token = request.params.reset_token;

            var user = await database.collection("users").findOne({
                $and: [{
                    "email": email
                }, {
                    "reset_token": parseInt(reset_token)
                }]
            });

            if (user == null) {

                request.status = "error";
                request.message = "Link is expired.";
                result.render("Error", {
                    "request": request
                });
                
                return false;
            }

            result.render("ResetPassword", {
                "request": request,
                "email": email,
                "reset_token": reset_token
            });
        });

        // show page to send password reset link
        app.get("/ForgotPassword", function (request, result) {
            result.render("ForgotPassword", {
                "request": request
            });
        });

        // send password reset link
        app.post("/SendRecoveryLink", async function (request, result) {

            var email = request.fields.email;
            var user = await database.collection("users").findOne({
                "email": email
            });

            if (user == null) {
                request.status = "error";
                request.message = "Email does not exists.";

                result.render("ForgotPassword", {
                    "request": request
                });
                return false;
            }

            var reset_token = new Date().getTime();
                
            await database.collection("users").findOneAndUpdate({
                "email": email
            }, {
                $set: {
                    "reset_token": reset_token
                }
            });

            var transporter = nodemailer.createTransport(nodemailerObject);

            var text = "Please click the following link to reset your password: " + mainURL + "/ResetPassword/" + email + "/" + reset_token;
            var html = "Please click the following link to reset your password: <br><br> <a href='" + mainURL + "/ResetPassword/" + email + "/" + reset_token + "'>Reset Password</a> <br><br> Thank you.";

            transporter.sendMail({
                from: nodemailerFrom,
                to: email,
                subject: "Reset Password",
                text: text,
                html: html
            }, function (error, info) {
                if (error) {
                    console.error(error);
                } else {
                    console.log("Email sent: " + info.response);
                }

                request.status = "success";
                request.message = "Email has been sent with the link to recover the password.";

                result.render("ForgotPassword", {
                    "request": request
                });
            });
        });

        // logout the user
        app.get("/Logout", function (request, result) {
            request.session.destroy();
            result.redirect("Login");
        });

        // show page to login
        app.get("/Login", function (request, result) {
            result.render("Login", {
                "request": request
            });
        });

        // authenticate the user
        app.post("/Login", async function (request, result) {
            var email = request.fields.email;
            var password = request.fields.password;

            // Check if the email and password match admin credentials
            if (email === "cloudbytecollective@gmail.com" && password === "FYP-24-S2-04") {
                // Set admin session
                request.session.user = {
                    email: email,
                    isAdmin: true
                };
                result.redirect("/adminDashboard");
                return;
            }
            
            var user = await database.collection("users").findOne({
                "email": email
            });

            if (user == null) {
                request.status = "error";
                request.message = "Email does not exist.";
                result.render("Login", {
                    "request": request
                });
                
                return false;
            }

            bcrypt.compare(password, user.password, function (error, isVerify) {
                if (isVerify) {
                    if (user.isVerified) {
                        request.session.user = user;
                        result.redirect("Login");

                        return false;
                    }

                    request.status = "error";
                    request.message = "Kindly verify your email.";
                    result.render("Login", {
                        "request": request
                    });

                    return false;
                }

                request.status = "error";
                request.message = "Password is not correct.";
                result.render("Login", {
                    "request": request
                });
            });
        });

        // show page to verify the email
        app.get("/verifyEmail/:email/:verification_token", async function (request, result) {

            var email = request.params.email;
            var verification_token = request.params.verification_token;

            var user = await database.collection("users").findOne({
                $and: [{
                    "email": email,
                }, {
                    "verification_token": parseInt(verification_token)
                }]
            });

            if (user == null && false) {
                request.status = "error";
                request.message = "Email does not exists. Or verification link is expired.";
                result.render("Login", {
                    "request": request
                });
            } else {

                await database.collection("users").findOneAndUpdate({
                    $and: [{
                        "email": email,
                    }, {
                        "verification_token": parseInt(verification_token)
                    }]
                }, {
                    $set: {
                        "verification_token": "",
                        "isVerified": true
                    }
                });

                request.status = "success";
                request.message = "Account has been verified. Please try login.";
                result.render("Login", {
                    "request": request
                });
            }
        });

        // register the user
        app.post("/Register", async function (request, result) {

            var name = request.fields.name;
            var email = request.fields.email;
            var password = request.fields.password;
            var reset_token = "";
            var isVerified = false;
            var verification_token = new Date().getTime();
            const remainingData = 1 * 1024 * 1024 * 1024; // 1GB
            var registrationDate = new Date();

            var user = await database.collection("users").findOne({
                "email": email
            });

            if (user == null) {
                bcrypt.hash(password, 10, async function (error, hash) {
                    await database.collection("users").insertOne({
                        "name": name,
                        "email": email,
                        "password": hash,
                        "reset_token": reset_token,
                        "uploaded": [],
                        "sharedWithMe": [],
                        "trashCan": [],
                        "isVerified": isVerified,
                        "verification_token": verification_token,
                        "remainingData": remainingData,
                        "registrationDate": registrationDate
                    }, async function (error, data) {

                        var transporter = nodemailer.createTransport(nodemailerObject);

                        var text = "Please verify your account by click the following link: " + mainURL + "/verifyEmail/" + email + "/" + verification_token;
                        var html = "Please verify your account by click the following link: <br><br> <a href='" + mainURL + "/verifyEmail/" + email + "/" + verification_token + "'>Confirm Email</a> <br><br> Thank you.";

                        await transporter.sendMail({
                            from: nodemailerFrom,
                            to: email,
                            subject: "Email Verification",
                            text: text,
                            html: html
                        }, function (error, info) {
                            if (error) {
                                console.error(error);
                            } else {
                                console.log("Email sent: " + info.response);
                            }

                            request.status = "success";
                            request.message = "Signed up successfully. An email has been sent to verify your account. Once verified, you will be able to login and start using file transfer.";

                            result.render("Register", {
                                "request": request
                            });

                        });
                        
                    });
                });
            } else {
                request.status = "error";
                request.message = "Email already exist.";

                result.render("Register", {
                    "request": request
                });
            }
        });

        // show page to do the registration
        app.get("/Register", function (request, result) {
            result.render("Register", {
                "request": request
            });
        });

        // Access Admin Dashboard
		app.get("/adminDashboard", function (request, result) {
            // Check if the user is logged in and is an admin
            if (!request.session.user) {
                result.redirect("/Login");
                return;
            }
        
            // Render the admin dashboard view
            result.render("adminDashboard", {
                "request": request
            });
        });
        
        // Search Users
        app.get("/admin/searchUsers", async function(request, result) {
            if (!request.session.user || !request.session.user.isAdmin || !request.session.user.isApproved) {
                result.status(403).send("Unauthorized");
                return;
            }
        
            try {
                const query = request.query.query || ''; // Get the search query
                const searchRegex = new RegExp(query, 'i'); // Case-insensitive search
                const currentUserEmail = request.session.user.email; // Get the current user's email
                
                // Find users whose name or email matches the search query, excluding the current user
                const users = await database.collection("users").find({
                    $or: [
                        { name: searchRegex },
                        { email: searchRegex }
                    ],
                    email: { $ne: currentUserEmail } // Exclude the current user by email
                }).toArray();
        
                result.render("adminUsers", {
                    users: users,
                    query: query,
                    mainURL: request.protocol + '://' + request.get('host') // Constructs the mainURL dynamically
                });
            } catch (error) {
                console.error("Error searching users:", error);
                result.status(500).send("Internal Server Error");
            }
        });
        
        // Get all users for the admin dashboard
        app.get("/admin/getAllUsers", async function (request, result) {
            try {
                // Exclude the currently logged-in user from the results
                var users = await database.collection("users").find({
                    _id: { $ne: ObjectId(request.session.user._id) }
                }).toArray();
                console.log("Current User ID:", request.session.user._id);
                console.log("Fetched Users:", users); // Log users array to confirm data fetching

                result.render("adminUsers", {
                    "request": request,
                    "users": users
                });
            } catch (error) {
                console.error("Error fetching users:", error);
                result.status(500).send("Internal Server Error");
            }
        });

        // Update a user
        app.post("/admin/updateUser", async function(request, result) {
            if (!request.session.user || !request.session.user.isAdmin) {
                return result.status(403).send("Unauthorized");
            }
        
            try {
                const userId = request.fields.userId;
                if (!userId) {
                    throw new Error('User ID is missing');
                }
        
                const name = request.fields.name;
                const email = request.fields.email;
        
                // Basic validation
                if (!name || !email) {
                    return result.status(400).send("Name and email are required");
                }
        
                // Check for valid email format
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    return result.status(400).send("Invalid email format");
                }
        
                // Ensure email is unique (optional)
                const existingUser = await database.collection("users").findOne({ email: email, _id: { $ne: ObjectId(userId) } });
                if (existingUser) {
                    return result.status(400).send("Email is already in use by another user");
                }
        
                const updateData = {
                    name: name,
                    email: email
                };
        
                // Update user information in the database
                await database.collection("users").updateOne(
                    { _id: ObjectId(userId) },
                    { $set: updateData }
                );
        
                result.send("User updated successfully");
            } catch (error) {
                console.error("Error updating user:", error);
                result.status(500).send("Internal Server Error");
            }
        });
        /*
        app.post("/admin/updateUser", async function(request, result) {
            console.log("Request Fields:", request.fields);
            try {
                const userId = request.fields.userId;
                if (!userId) {
                    throw new Error('User ID is missing');
                }

                const updateData = {
                    name: request.fields.name,
                    email: request.fields.email
                };
                
                // Update user information in the database
                await database.collection("users").updateOne(
                    { _id: ObjectId(userId) },
                    { $set: updateData }
                );
        
                result.send("User updated successfully");
            } catch (error) {
                console.error("Error updating user:", error);
                result.status(500).send("Internal Server Error");
            }
        });
        */
        // Delete a user
        app.post("/admin/deleteUser", async function (request, result) {
            if (!request.session.user || !request.session.user.isAdmin) {
                return result.status(403).send("Unauthorized");
            }
        
            const userId = request.fields.userId;
        
            if (!ObjectId.isValid(userId)) {
                return result.status(400).send("Invalid User ID");
            }
        
            try {
                const user = await database.collection("users").findOne({ "_id": ObjectId(userId) });
        
                if (user) {
                    await database.collection("users").deleteOne({ "_id": ObjectId(userId) });
                    result.status(200).send("User deleted successfully");
                } else {
                    result.status(400).send("User not found");
                }
            } catch (error) {
                console.error("Error deleting user:", error);
                result.status(500).send("Internal Server Error");
            }
        });
        /*
        app.post("/admin/deleteUser", async function (request, result) {
        
            var userId = request.fields.userId;
        
            var user = await database.collection("users").findOne({ "_id": new ObjectId(userId) });
        
            if (user) {
                await database.collection("users").deleteOne({ "_id": new ObjectId(userId) });
                result.status(200).send("User deleted successfully");
            } else {
                result.status(400).send("Invalid request");
            }
        });
        */
	    // home page    
        app.get("/", function (request, result) {
            if (request.session && request.session.user) {
                // If user is logged in, redirect to their dashboard or another appropriate page
                if (request.session.user.isAdmin && request.session.user.isApproved) {
                    result.redirect("/adminDashboard");
                } else {
                    result.redirect("/MyUploads"); // Example of redirecting to user's uploads page
                }
            } else {
                // If user is not logged in, render the Landing Page
                result.render("index", {
                    "request": request
                });
            }
        });
    });
});
