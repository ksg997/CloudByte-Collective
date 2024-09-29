const ObjectId = require("mongodb").ObjectId;
const functions = require("./functions");
const fileSystem = require("fs");
const adminPosts = require("./admin-posts");

// to encrypt/decrypt passwords
var bcrypt = require("bcrypt");

var jwt = require("jsonwebtoken");
var accessTokenSecret = "1234567890AdminTokenSecret";

module.exports = {
	database: null,
	socketIO: null,
	socketUsers: [],

	setData: function (database, socketIO, socketUsers) {
		this.database = database;
		this.socketIO = socketIO;
		this.socketUsers = socketUsers;

		adminPosts.setData(database);
	},

	init: function (app, express) {
		const self = this;
		const router = express.Router();

		router.post("/GetFolder", async function (request, result) {
            const folderId = request.fields.folderId;
            const userId = request.fields.userId;
            const accessToken = request.fields.accessToken;
            
            var admin = await self.database.collection("admin").findOne({
                "accessToken": accessToken
            });
        
            if (admin == null) {
                result.json({
                    "status": "error",
                    "message": "Admin has been logged out. Please login again."
                });
                return false;
            }

            var user = await self.database.collection("users").findOne({
                "_id": ObjectId(userId)
            });

            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "User does not exists."
                });
                return false;
            }

            var folder = await functions.recursiveGetFolder(user.uploaded, folderId);

            if (folder == null) {
                result.json({
                    "status": "error",
                    "message": "Folder does not exists."
                });
                return false;
            }

            result.json({
                "status": "success",
                "message": "Data has been fetched",
                "user": user,
                "files": folder.files,
                "folderName": folder.folderName
            });
        });

        router.get("/FolderDetail/:folder_id/:user_id", async function (request, result) {
            result.render("Admin/FolderDetail", {
                folder_id: request.params.folder_id,
                user_id: request.params.user_id
            });
        });

        // download file
        router.post("/DownloadFile", async function (request, result) {
            const _id = request.fields._id;
            const userId = request.fields.userId;
            const accessToken = request.fields.accessToken;
            
            var admin = await self.database.collection("admin").findOne({
                "accessToken": accessToken
            });
        
            if (admin == null) {
                result.json({
                    "status": "error",
                    "message": "Admin has been logged out. Please login again."
                });
                return false;
            }

            var user = await self.database.collection("users").findOne({
                "_id": ObjectId(userId)
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

            const adminSocketID = self.socketUsers[accessToken];

            fileSystem.open(file.filePath, 'r', function(err, fd) {
                if (err) throw err;
                function readNextChunk() {
                    fileSystem.read(fd, buffer, 0, CHUNK_SIZE, null, function(err, nread) {
                        if (err) throw err;

                        if (nread === 0) {
                            // done reading file, do any necessary finalization steps

                            fileSystem.close(fd, function(err) {
                                if (err) throw err;
                            });

                            self.socketIO.to(adminSocketID).emit("download_completed", {
                                "fileType": file.type,
                                "fileName": file.name
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
                            self.socketIO.to(adminSocketID).emit("download_chunk_received", data);
                            
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
        });

        router.post("/Users/GetDetail", async function (request, result) {
            var accessToken = request.fields.accessToken;
            var _id = request.fields._id;
        
            var admin = await self.database.collection("admin").findOne({
                "accessToken": accessToken
            });
        
            if (admin == null) {
                result.json({
                    "status": "error",
                    "message": "Admin has been logged out. Please login again."
                });
                return false;
            }

            var user = await self.database.collection("users").findOne({
                _id: ObjectId(_id)
            });

            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "User does not exists."
                });
                return false;
            }

            result.json({
                "status": "success",
                "message": "Data has been fetched.",
                "user": user
            });
        });

        router.get("/User/GetDetail/:_id", async function (request, result) {
            result.render("Admin/Users/Detail", {
                _id: request.params._id
            });
        });

        router.post("/Users/Get", async function (request, result) {
            var accessToken = request.fields.accessToken;
        
            var admin = await self.database.collection("admin").findOne({
                "accessToken": accessToken
            });
        
            if (admin == null) {
                result.json({
                    "status": "error",
                    "message": "Admin has been logged out. Please login again."
                });
                return false;
            }

            var users = await self.database.collection("users").find({}).toArray();

            result.json({
                "status": "success",
                "message": "Data has been fetched.",
                "users": users
            });
        });

        router.get("/Users", async function (request, result) {
            result.render("Admin/Users/Index.ejs");
        });

        // return admin data using access token
        router.post("/Get", async function (request, result) {
            var accessToken = request.fields.accessToken;
        
            var admin = await self.database.collection("admin").findOne({
                "accessToken": accessToken
            });
        
            if (admin == null) {
                result.json({
                    "status": "error",
                    "message": "Admin has been logged out. Please login again."
                });
                return false;
            }
        
            result.json({
                "status": "success",
                "message": "Data has been fetched.",
                "admin": admin
            });
        });
        
        // empty the access token of admin (logout)
        router.post("/Logout", async function (request, result) {
            var accessToken = request.fields.accessToken;
        
            await self.database.collection("admin").findOneAndUpdate({
                "accessToken": accessToken
            }, {
                $set: {
                    "accessToken": ""
                }
            });
        
            result.json({
                "status": "success",
                "message": "Admin has been logged out."
            });
        });

        // route for login requests
        router.route("/Login")
        
            // get request accessed from browser
            .get(function (request, result) {
        
                // render login.ejs file inside "views" folder
                result.render("Admin/Login.ejs");
            })
        
            // post request called from AJAX
            .post(async function (request, result) {
        
                // get values from login form
                var email = request.fields.email;
                var password = request.fields.password;
        
                // check if email exists
                var admin = await self.database.collection("admin").findOne({
                    "email": email
                });
        
                if (admin == null) {
                    result.json({
                        "status": "error",
                        "message": "Invalid credentials."
                    });
                    return false;
                }

                bcrypt.compare(password, admin.password, async function (error, isVerify) {
                	if (isVerify) {
                		// generate JWT of user
		                var accessToken = jwt.sign({
		                    "email": email
		                }, accessTokenSecret);

		                // update JWT of user in database
		                await self.database.collection("admin").findOneAndUpdate({
		                    "email": email
		                }, {
		                    $set: {
		                        "accessToken": accessToken
		                    }
		                });

		                result.json({
		                    "status": "success",
		                    "message": "Login successfully.",
		                    "accessToken": accessToken
		                });

		                return false;
                	}

                	result.json({
	                    "status": "error",
	                    "message": "Invalid credentials."
	                });
                });
            });

        router.get("/", async function (request, result) {
            var admin = await self.database.collection("admin").findOne({
                "email": "admin@gmail.com"
            });
            if (admin == null) {
            	bcrypt.hash("admin", 10, async function (error, hash) {
	                await self.database.collection("admin").insertOne({
	                    "name": "Admin",
	                    "email": "admin@gmail.com",
	                    "password": hash
	                });
	                result.redirect("/Admin/Login");
	            });
	            return true;
            }
            result.render("Admin/Dashboard.ejs");
        });

		app.use("/Admin", router);
		adminPosts.init(express, router);
	}
};