// to store files
const fileSystem = require("fs");

// the unique ID for each mongo DB document
const ObjectId = require("mongodb").ObjectId;

// to remove folder and all sub-directories in it
var rimraf = require("rimraf");

module.exports = {
	// recursive function to get the shared file
	recursiveGetSharedFile: function (files, _id) {
	    var singleFile = null;

	    for (var a = 0; a < files.length; a++) {
	        var file = (typeof files[a].file === "undefined") ? files[a] : files[a].file;

	        // return if file type is not folder and ID is found
	        if (file.type != "folder") {
	            if (file._id == _id) {
	                return file;
	            }
	        }

	        // if it is a folder and have files, then do the recursion
	        if (file.type == "folder" && file.files.length > 0) {
	            singleFile = this.recursiveGetSharedFile(file.files, _id);
	            // return the file if found in sub-folders
	            if (singleFile != null) {
	                return singleFile;
	            }
	        }
	    }
	},

	// recursive function to get the file from uploaded
	recursiveGetFile: function (files, _id) {
	    var singleFile = null;

	    for (var a = 0; a < files.length; a++) {
	        const file = files[a];

	        // return if file type is not folder and ID is found
	        if (file.type != "folder") {
	            if (file._id == _id) {
	                return file;
	            }
	        }

	        // if it is a folder and have files, then do the recursion
	        if (file.type == "folder" && file.files.length > 0) {
	            singleFile = this.recursiveGetFile(file.files, _id);
	            // return the file if found in sub-folders
	            if (singleFile != null) {
	                return singleFile;
	            }
	        }
	    }
	},

	// recursive function to get the shared folder
	recursiveGetSharedFolder: function (files, _id) {
	    var singleFile = null;

	    for (var a = 0; a < files.length; a++) {
	        var file = (typeof files[a].file === "undefined") ? files[a] : files[a].file;

	        // return if file type is folder and ID is found
	        if (file.type == "folder") {
	            if (file._id == _id) {
	                return file;
	            }

	            // if it has files, then do the recursion
	            if (file.files.length > 0) {
	                singleFile = this.recursiveGetSharedFolder(file.files, _id);
	                // return the file if found in sub-folders
	                if (singleFile != null) {
	                    return singleFile;
	                }
	            }
	        }
	    }
	},

	// function to add new uploaded object and return the updated array
	getUpdatedArray: function (arr, _id, uploadedObj) {
	    for (var a = 0; a < arr.length; a++) {
	        // push in files array if type is folder and ID is found
	        if (arr[a].type == "folder") {
	            if (arr[a]._id == _id) {
	                arr[a].files.push(uploadedObj);
	                arr[a]._id = ObjectId(arr[a]._id);
	            }

	            // if it has files, then do the recursion
	            if (arr[a].files.length > 0) {
	                arr[a]._id = ObjectId(arr[a]._id);
	                this.getUpdatedArray(arr[a].files, _id, uploadedObj);
	            }
	        }
	    }

	    return arr;
	},

	// recursive function to remove the shared file and return the updated array
	removeSharedFileReturnUpdated: function(arr, _id) {
	    for (var a = 0; a < arr.length; a++) {
	        var file = (typeof arr[a].file === "undefined") ? arr[a] : arr[a].file;

	        // remove the file if found
	        if (file.type != "folder" && file._id == _id) {
	            arr.splice(a, 1);
	            break;
	        }

	        // do the recursion if it has sub-folders
	        if (file.type == "folder" && file.files.length > 0) {
	            arr[a]._id = ObjectId(arr[a]._id);
	            this.removeSharedFileReturnUpdated(file.files, _id);
	        }
	    }
	    return arr;
	},

	// recursive function to remove the file and return the updated array
	removeFileReturnUpdated: function(arr, _id) {
	    for (var a = 0; a < arr.length; a++) {
	        if (arr[a].type != "folder" && arr[a]._id == _id) {
	            // remove the file from uploads folder
	            // try {
	                // fileSystem.unlinkSync(arr[a].filePath);
	            // } catch (exp) {
	                // 
	            // }
	            // remove the file from array
	            arr.splice(a, 1);
	            break;
	        }

	        // do the recursion if it has sub-folders
	        if (arr[a].type == "folder" && arr[a].files.length > 0) {
	            arr[a]._id = ObjectId(arr[a]._id);
	            this.removeFileReturnUpdated(arr[a].files, _id);
	        }
	    }

	    return arr;
	},

	// recursive function to remove the shared folder and return the updated array
	removeSharedFolderReturnUpdated: function(arr, _id) {
	    for (var a = 0; a < arr.length; a++) {
	        var file = (typeof arr[a].file === "undefined") ? arr[a] : arr[a].file;
	        if (file.type == "folder") {
	            if (file._id == _id) {
	                arr.splice(a, 1);
	                break;
	            }

	            // do the recursion if it has sub-folders
	            if (file.files.length > 0) {
	                file._id = ObjectId(file._id);
	                this.removeSharedFolderReturnUpdated(file.files, _id);
	            }
	        }
	    }

	    return arr;
	},

	// recursive function to remove the folder and return the updated array
	removeFolderReturnUpdated: function(arr, _id) {
	    for (var a = 0; a < arr.length; a++) {
	        if (arr[a].type == "folder") {
	            if (arr[a]._id == _id) {
	                // remove the folder with all sub-directories in it
	                rimraf(arr[a].folderPath, function () {
	                    // console.log("done");
	                });
	                arr.splice(a, 1);
	                break;
	            }

	            if (arr[a].files.length > 0) {
	                arr[a]._id = ObjectId(arr[a]._id);
	                this.removeFolderReturnUpdated(arr[a].files, _id);
	            }
	        }
	    }

	    return arr;
	},

	// recursive function to rename sub-folders
	renameSubFolders: function(arr, oldName, newName) {
	    for (var a = 0; a < arr.length; a++) {
	        // set new folder path by splitting it in parts by "/"
	        var pathParts = (arr[a].type == "folder") ? arr[a].folderPath.split("/") : arr[a].filePath.split("/");

	        var newPath = "";
	        for (var b = 0; b < pathParts.length; b++) {
	            // replace the old name with new name
	            if (pathParts[b] == oldName) {
	                pathParts[b] = newName;
	            }
	            newPath += pathParts[b];
	            // append "/" at the end, except the last index
	            if (b < pathParts.length - 1) {
	                newPath += "/";
	            }
	        }

	        if (arr[a].type == "folder") {
	            arr[a].folderPath = newPath;

	            if (arr[a].files.length > 0) {
	                this.renameSubFolders(arr[a].files, _id, newName);
	            }
	        } else {
	            arr[a].filePath = newPath;
	        }
	    }
	},

	// recursive function to rename folder and return updated array
	renameFolderReturnUpdated: function(arr, _id, newName) {
	    // loop through all files
	    for (var a = 0; a < arr.length; a++) {
	        if (arr[a].type == "folder") {
	            if (arr[a]._id == _id) {
	                
	                const oldFolderName = arr[a].folderName
	                var folderPathParts = arr[a].folderPath.split("/");
	                
	                var newFolderPath = "";
	                for (var b = 0; b < folderPathParts.length; b++) {
	                    // replace the old path with new
	                    if (folderPathParts[b] == oldFolderName) {
	                        folderPathParts[b] = newName;
	                    }
	                    newFolderPath += folderPathParts[b];
	                    // append "/" at the end, except for last index
	                    if (b < folderPathParts.length - 1) {
	                        newFolderPath += "/";
	                    }
	                }
	                // rename the folder
	                fileSystem.rename(arr[a].folderPath, newFolderPath, function (error) {
	                    // 
	                });

	                // update the array values
	                arr[a].folderName = newName;
	                arr[a].folderPath = newFolderPath;

	                // update the sub folders path
	                this.renameSubFolders(arr[a].files, oldFolderName, newName);
	                break;
	            }

	            if (arr[a].files.length > 0) {
	                this.renameFolderReturnUpdated(arr[a].files, _id, newName);
	            }
	        }
	    }
	    
	    return arr;
	},

	// recursive function to rename file and return updated array
	renameFileReturnUpdated: function(arr, _id, newName) {
	    for (var a = 0; a < arr.length; a++) {
	        if (arr[a].type != "folder") {
	            if (arr[a]._id == _id) {
	                
	                const oldFileName = arr[a].name
	                var filePathParts = arr[a].filePath.split("/");
	                
	                var newFilePath = "";
	                for (var b = 0; b < filePathParts.length; b++) {
	                    if (filePathParts[b] == oldFileName) {
	                        filePathParts[b] = newName;
	                    }
	                    newFilePath += filePathParts[b];
	                    if (b < filePathParts.length - 1) {
	                        newFilePath += "/";
	                    }
	                }
	                // rename the file
	                fileSystem.rename(arr[a].filePath, newFilePath, function (error) {
	                    // 
	                });

	                // update the array values
	                arr[a].name = newName;
	                arr[a].filePath = newFilePath;
	                break;
	            }
	        }

	        // do the recursion, if folder has sub-folders
	        if (arr[a].type == "folder" && arr[a].files.length > 0) {
	            this.renameFileReturnUpdated(arr[a].files, _id, newName);
	        }
	    }

	    return arr;
	},

	// recursive function to get all folders
	recursiveGetAllFolders: function (files, _id) {
	    var folders = [];

	    for (var a = 0; a < files.length; a++) {
	        const file = files[a];

	        if (file.type == "folder") {
	            // get all, except the selected
	            if (file._id != _id) {
	                folders.push(file);
	                if (file.files.length > 0) {
	                    var tempFolders = this.recursiveGetAllFolders(file.files, _id);
	                    // push the returned folders too in array
	                    for (var b = 0; b < tempFolders.length; b++) {
	                        folders.push(tempFolders[b]);
	                    }
	                }
	            }
	        }
	    }

	    return folders;
	},

	// recursive function to push in moved folder files array
	updateMovedToFolderParent_ReturnUpdated: function(arr, _id, moveFolder) {
	    for (var a = 0; a < arr.length; a++) {
	        if (arr[a].type == "folder") {
	            if (arr[a]._id == _id) {

	                moveFolder.folderPath = arr[a].folderPath + "/" + moveFolder.folderName;
	                arr[a].files.push(moveFolder);
	                break;
	            }

	            // if it has further files, do the recursion
	            if (arr[a].files.length > 0) {
	                arr[a]._id = ObjectId(arr[a]._id);
	                this.updateMovedToFolderParent_ReturnUpdated(arr[a].files, _id, moveFolder);
	            }
	        }
	    }

	    return arr;
	},

	// recursive function to move the folder and return updated array
	moveFolderReturnUpdated: function(arr, _id, moveFolder, moveToFolder) {
	    for (var a = 0; a < arr.length; a++) {
	        if (arr[a].type == "folder") {
	            if (arr[a]._id == _id) {

	                // rename() will move the file
	                const newPath = moveToFolder.folderPath + "/" + arr[a].folderName;
	                fileSystem.rename(arr[a].folderPath, newPath, function () {
	                    // console.log("Folder has been moved.");
	                });

	                arr.splice(a, 1);
	                break;
	            }

	            if (arr[a].files.length > 0) {
	                arr[a]._id = ObjectId(arr[a]._id);
	                this.moveFolderReturnUpdated(arr[a].files, _id, moveFolder, moveToFolder);
	            }
	        }
	    }

	    return arr;
	},

	// recursive function to search uploaded files
	recursiveSearch: function (files, query) {
	    var singleFile = null;

	    for (var a = 0; a < files.length; a++) {
	        const file = files[a];

	        if (file.type == "folder") {
	            // search folder case-insensitive
	            if (file.folderName.toLowerCase().search(query.toLowerCase()) > -1) {
	                return file;
	            }

	            if (file.files.length > 0) {
	                singleFile = this.recursiveSearch(file.files, query);
	                if (singleFile != null) {
	                    // need parent folder in case of files
	                    if (singleFile.type != "folder") {
	                        singleFile.parent = file;
	                    }
	                    return singleFile;
	                }
	            }
	        } else {
	            if (file.name.toLowerCase().search(query.toLowerCase()) > -1) {
	                return file;
	            }
	        }
	    }
	},

	// recursive function to search shared files
	recursiveSearchShared: function (files, query) {
	    var singleFile = null;

	    for (var a = 0; a < files.length; a++) {
	        var file = (typeof files[a].file === "undefined") ? files[a] : files[a].file;

	        if (file.type == "folder") {
	            if (file.folderName.toLowerCase().search(query.toLowerCase()) > -1) {
	                return file;
	            }

	            if (file.files.length > 0) {
	                singleFile = this.recursiveSearchShared(file.files, query);
	                if (singleFile != null) {
	                    if (singleFile.type != "folder") {
	                        singleFile.parent = file;
	                    }
	                    return singleFile;
	                }
	            }
	        } else {
	            if (file.name.toLowerCase().search(query.toLowerCase()) > -1) {
	                return file;
	            }
	        }
	    }
	},

	// recursive function to get the total uploaded data
	recursiveGetTotalUploadedData: function(files) {
	    var total = 0;
	    for (var a = 0; a < files.length; a++) {
	        if (files[a].type == "folder") {
	            total += this.recursiveGetTotalUploadedData(files[a].files);
	        } else {
	            total += files[a].size;
	        }
	    }
	    return total;
	},

	// recursive function to get folder size
	getFolderSize: function(arr) {
	    var sum = 0;
	    for (var a = 0; a < arr.length; a++) {
	        if (arr[a].type == "folder") {
	            if (arr[a].files.length > 0) {
	                sum += this.getFolderSize(arr[a].files);
	            }
	        } else {
	            sum += arr[a].size;
	        }
	    }
	    return sum;
	},

	// recursive function to get the folder from uploaded
	recursiveGetFolder: function (files, _id) {
	    var singleFile = null;

	    for (var a = 0; a < files.length; a++) {
	        const file = files[a];

	        // return if file type is folder and ID is found
	        if (file.type == "folder") {
	            if (file._id == _id) {
	                return file;
	            }

	            // if it has files, then do the recursion
	            if (file.files.length > 0) {
	                singleFile = this.recursiveGetFolder(file.files, _id);
	                // return the file if found in sub-folders
	                if (singleFile != null) {
	                    return singleFile;
	                }
	            }
	        }
	    }
	}
};