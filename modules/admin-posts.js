const fs = require("fs");
const ObjectId = require("mongodb").ObjectId;

module.exports = {
	database: null,

	setData: function (database) {
		this.database = database;
	},

	init: function (express, router) {
		const self = this;
		const postsRouter = express.Router();

		postsRouter.post("/Delete", async function (request, result) {
			const accessToken = request.fields.accessToken;
			const slug = request.fields.slug;

			const admin = await self.database.collection("admin").findOne({
	            "accessToken": accessToken
	        });

	        if (admin == null) {
	            result.json({
	                "status": "error",
	                "message": "User has been logged out. Please login again."
	            });
	            return;
	        }

	        const post = await self.database.collection("posts").findOne({
	            $and: [{
	                "user._id": admin._id
	            }, {
	                "slug": slug
	            }]
	        });

	        if (post == null) {
	            result.json({
	                "status": "error",
	                "message": "You do not have access to this post."
	            });
	            return;
	        }

	        await self.database.collection("posts").deleteOne({
	            $and: [{
	                "user._id": admin._id
	            }, {
	                "_id": post._id
	            }]
	        });

	        result.json({
                "status": "success",
                "message": "Post has been deleted."
            });
		});

		postsRouter.route("/Edit/:slug")
			.get(function (request, result) {
				const slug = request.params.slug;
		        result.render("Admin/Posts/Edit", {
		        	slug: slug
		        });
			})
			.post(async function (request, result) {
				var title = request.fields.title;
		        var content = request.fields.content;
		        var image = request.files.image;
		        var _id = request.fields._id;
		        const categories = JSON.parse(request.fields.categories);
		        const accessToken = request.fields.accessToken;

		        const admin = await self.database.collection("admin").findOne({
		            "accessToken": accessToken
		        });

		        if (admin == null) {
		            result.json({
		                "status": "error",
		                "message": "User has been logged out. Please login again."
		            });
		            return;
		        }

		        const post = await self.database.collection("posts").findOne({
		            $and: [{
		                "user._id": admin._id
		            }, {
		                "_id": ObjectId(_id)
		            }]
		        });

		        if (post == null) {
		            result.json({
		                "status": "error",
		                "message": "You do not have access to this post."
		            });
		            return;
		        }

		        const updateObj = {
		            "title": title,
		            "content": content,
		            "categories": categories
		        };

		        if (image.size > 0 && image.type.includes("image")) {
		            const path = "uploads/" + (new Date().getTime()) + "-" + image.name;

		            fs.readFile(image.path, function (error, data) {
		                if (error) {
		                    console.log("Read error: " + error);
		                }
		                fs.writeFile(path, data, async function (error) {
		                    if (error) {
		                        console.log("Write error: " + error);
		                    }
		                    
		                    updateObj.image = path;
		                    await self.database.collection("posts").updateOne({
		                        $and: [{
		                            "user._id": admin._id
		                        }, {
		                            "_id": ObjectId(_id)
		                        }]
		                    }, {
		                        $set: updateObj
		                    });

		                    result.json({
		                        "status": "success",
		                        "message": "Post has been updated."
		                    });
		                });
		                fs.unlink(image.path, function (error) {
		                    // 
		                });
		            });

		            return true;
		        }

		        await self.database.collection("posts").updateOne({
		            $and: [{
		                "user._id": admin._id
		            }, {
		                "_id": ObjectId(_id)
		            }]
		        }, {
		            $set: updateObj
		        });

		        result.json({
		            "status": "success",
		            "message": "Post has been updated."
		        });
			});

		postsRouter.post("/Detail", async function (request, result) {
			const accessToken = request.fields.accessToken;
			const slug = request.fields.slug;

			const admin = await self.database.collection("admin").findOne({
	            "accessToken": accessToken
	        });

	        if (admin == null) {
	            result.json({
	                "status": "error",
	                "message": "Admin has been logged out. Please login again."
	            });
	            return false;
	        }

	        const post = await self.database.collection("posts").findOne({
	            "slug": slug
	        });

	        if (post == null) {
	            result.json({
	                "status": "error",
	                "message": "Post does not exists."
	            });
	            return;
	        }

	        result.json({
                "status": "success",
                "message": "Post has been fetched.",
                "post": post
            });
	    });

		postsRouter.post("/Fetch", async function (request, result) {
			const accessToken = request.fields.accessToken;

			const admin = await self.database.collection("admin").findOne({
	            "accessToken": accessToken
	        });

	        if (admin == null) {
	            result.json({
	                "status": "error",
	                "message": "Admin has been logged out. Please login again."
	            });
	            return false;
	        }

	        // number of records you want to show per page
		    const perPage = 10;
		 
		    // total number of records from database
		    const total = await self.database.collection("posts").count();
		 
		    // Calculating number of pagination links required
		    var pages = Math.ceil(total / perPage);

		    const pagination = [];
		    for (var a = 0; a < pages; a++) {
		    	pagination.push(a + 1);
		    }
		 
		    // get current page number
		    const pageNumber = request.fields.currentPage;
		 
		    // get records to skip
		    const startFrom = (pageNumber - 1) * perPage;
		 
		    // get data from mongo DB using pagination
		    const posts = await self.database.collection("posts").find({})
		        .sort({ "_id": -1 })
		        .skip(startFrom)
		        .limit(perPage)
		        .toArray();

		    result.json({
                status: "success",
                message: "Posts has been fetched.",
                posts: posts,
                pagination: pagination
            });
		});

		postsRouter.route("/Create")
			.get(function (request, result) {
				result.render("Admin/Posts/Create");
			})
			.post(async function (request, result) {
				var title = request.fields.title;
		        const slug = title.replace(/ /g, "-").toLowerCase();
		        var content = request.fields.content;
		        var image = request.files.image;
		        var accessToken = request.fields.accessToken;
		        const categories = JSON.parse(request.fields.categories);
		        const createdAt = new Date().getTime();

		        const admin = await self.database.collection("admin").findOne({
		            "accessToken": accessToken
		        });
		        if (admin == null) {
		            result.json({
		                "status": "error",
		                "message": "Admin has been logged out. Please login again."
		            });

		            return false;
		        }

		        const post = await self.database.collection("posts").findOne({
		            "slug": slug
		        });
		        if (post != null) {
		            result.json({
		                "status": "error",
		                "message": "Post with same title already exists."
		            });

		            return false;
		        }

		        const postObj = {
		        	"title": title,
                    "slug": slug,
                    "content": content,
                    "image": "",
                    "categories": categories,
                    "user": {
                        "_id": admin._id,
                        "name": admin.name
                    },
                    "createdAt": createdAt
		        };

		        if (image.size > 0 && image.type.includes("image")) {
		            const path = "uploads/" + (new Date().getTime()) + "-" + image.name;

		            fs.readFile(image.path, function (error, data) {
		                if (error) {
		                    console.log("Read error: " + error);
		                }
		                fs.writeFile(path, data, async function (error) {
		                    if (error) {
		                        console.log("Write error: " + error);
		                    }
		                    
		                    postObj.image = path;
		                    const document = await self.database.collection("posts").insertOne(postObj);

		                    result.json({
		                        "status": "success",
		                        "message": "Posted successfully.",
		                        "_id": document.insertedId
		                    });
		                });
		                fs.unlink(image.path, function (error) {
		                    // 
		                });
		            });

		            return true;
		        }

		        const document = await self.database.collection("posts").insertOne(postObj);
                result.json({
                    "status": "success",
                    "message": "Posted successfully.",
                    "_id": document.insertedId
                });
			});

		postsRouter.get("/", function (request, result) {
			result.render("Admin/Posts/Index");
		});

		router.use("/Posts", postsRouter);
	}
};