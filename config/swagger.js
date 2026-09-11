// Auto-generated Swagger spec from Postman collection
export const swaggerDocument = {
  "openapi": "3.0.0",
  "info": {
    "title": "VillagKart Consumer API",
    "version": "1.0.0",
    "description": "API Documentation for VillagKart Consumer/Customer App APIs."
  },
  "servers": [
    {
      "url": "/api/v1",
      "description": "Local / Default Server"
    }
  ],
  "components": {
    "securitySchemes": {
      "BearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Enter JWT token"
      }
    }
  },
  "paths": {
    "/categories": {
      "get": {
        "tags": [
          "03. Categories"
        ],
        "summary": "Get Categories",
        "description": "Endpoint for Get Categories",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "post": {
        "tags": [
          "03. Categories"
        ],
        "summary": "Get Categories (POST)",
        "description": "Endpoint for Get Categories (POST)",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "pincode": "{{pincode}}"
                }
              }
            }
          }
        }
      }
    },
    "/serviceability": {
      "get": {
        "tags": [
          "02. Serviceability"
        ],
        "summary": "Check Serviceability (GET)",
        "description": "Endpoint for Check Serviceability (GET)",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "post": {
        "tags": [
          "02. Serviceability"
        ],
        "summary": "Check Serviceability (POST)",
        "description": "Endpoint for Check Serviceability (POST)",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "pincode": "{{pincode}}"
                }
              }
            }
          }
        }
      }
    },
    "/serviceability/notify": {
      "post": {
        "tags": [
          "Serviceability"
        ],
        "summary": "Notify Location Waitlist (POST)",
        "description": "Endpoint for Notify Location Waitlist (POST)",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "mobileNumber": "9876543210",
                  "pincode": "999999"
                }
              }
            }
          }
        }
      }
    },
    "/cart": {
      "post": {
        "tags": [
          "Consumer Cart (Tiered Pricing)"
        ],
        "summary": "Add 15 Items (Tier 2)",
        "description": "Endpoint for Add 15 Items (Tier 2)",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "productId": "{{product_id}}",
                  "quantity": 15,
                  "action": "increment",
                  "warehouseId": "90bba17c-3ee8-4007-ab3f-c4a6e772d6fc"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "get": {
        "tags": [
          "E2E - Multi Warehouse Cart Flow"
        ],
        "summary": "MW2 - Get Cart",
        "description": "Endpoint for MW2 - Get Cart",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: warehouseId",
            "example": "{{warehouseId_mw_2}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "delete": {
        "tags": [
          "08. Cart"
        ],
        "summary": "Clear Cart",
        "description": "Endpoint for Clear Cart",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: warehouseId",
            "example": "{{warehouseId}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/bundles": {
      "get": {
        "tags": [
          "Virtual Bundle System"
        ],
        "summary": "Get All Active Bundles (Consumer)",
        "description": "Endpoint for Get All Active Bundles (Consumer)",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "post": {
        "tags": [
          "Virtual Bundle System"
        ],
        "summary": "Create Bundle (Admin)",
        "description": "Endpoint for Create Bundle (Admin)",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "name": "Breakfast Saver Bundle",
                  "description": "Bread, Milk, and Eggs",
                  "bundlePrice": 120,
                  "mrp": 150,
                  "items": [
                    {
                      "productId": "replace-with-product-id-1",
                      "quantity": 1
                    },
                    {
                      "productId": "replace-with-product-id-2",
                      "quantity": 1
                    }
                  ]
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/cart/items": {
      "post": {
        "tags": [
          "E2E - Multi Warehouse Cart Flow"
        ],
        "summary": "MW2 - Add to Cart",
        "description": "Endpoint for MW2 - Add to Cart",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "productId": "{{productId_mw_2}}",
                  "warehouseId": "{{warehouseId_mw_2}}",
                  "quantity": 1,
                  "type": "inc"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/check": {
      "get": {
        "tags": [
          "19. E2E Test (Run All)"
        ],
        "summary": "E2E - Health Check",
        "description": "Endpoint for E2E - Health Check",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/user/send-otp": {
      "post": {
        "tags": [
          "19. E2E Test (Run All)"
        ],
        "summary": "E2E - Send OTP",
        "description": "Endpoint for E2E - Send OTP",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "phone": "{{phone}}",
                  "countryCode": "+91"
                }
              }
            }
          }
        }
      }
    },
    "/user/resend-otp": {
      "post": {
        "tags": [
          "01. Authentication"
        ],
        "summary": "Resend OTP",
        "description": "Endpoint for Resend OTP",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "phone": "{{phone}}",
                  "countryCode": "+91"
                }
              }
            }
          }
        }
      }
    },
    "/user/verify-otp": {
      "post": {
        "tags": [
          "19. E2E Test (Run All)"
        ],
        "summary": "E2E - Verify OTP",
        "description": "Endpoint for E2E - Verify OTP",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "phone": "{{phone}}",
                  "countryCode": "+91",
                  "otp": "{{otp}}"
                }
              }
            }
          }
        }
      }
    },
    "/user/me": {
      "get": {
        "tags": [
          "01. Authentication"
        ],
        "summary": "Get Profile",
        "description": "GET /api/v1/user/me. Returns user including totalOrdersCount, totalWishlistCount, isProfileComplete, missingFields, addresses.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/user/update-profile": {
      "patch": {
        "tags": [
          "01. Authentication"
        ],
        "summary": "Update Profile",
        "description": "PATCH /api/v1/user/update-profile. name + email required by validator; optional gender, dob (ISO), profileImage (URL), address object, referralCode.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "name": "Test User",
                  "email": "test@example.com",
                  "gender": "prefer_not_to_say",
                  "profileImage": "https://example.com/avatar.png"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/updateToken": {
      "post": {
        "tags": [
          "01. Authentication"
        ],
        "summary": "Update device token (FCM)",
        "description": "POST /api/v1/updateToken. Required: userId, deviceId, deviceToken. Optional: platform (android|ios|web), device metadata, notificationEnabled, isEmulator, isRooted, updatedAt (ISO). No Bearer auth in route — validate userId server-side against your app security model.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "userId": "{{userId}}",
                  "deviceId": "device-uuid-001",
                  "deviceToken": "fcm-or-apns-token-here",
                  "platform": "android",
                  "deviceModel": "Pixel 8",
                  "deviceBrand": "Google",
                  "deviceManufacturer": "Google",
                  "deviceName": "Pixel 8",
                  "osName": "Android",
                  "osVersion": "14",
                  "appVersion": "1.0.0",
                  "buildNumber": "100",
                  "sdkVersion": "34",
                  "networkType": "wifi",
                  "ipAddress": "",
                  "language": "en",
                  "timezone": "Asia/Kolkata",
                  "country": "IN",
                  "notificationEnabled": true,
                  "isEmulator": false,
                  "isRooted": false,
                  "updatedAt": "2026-04-06T12:00:00.000Z"
                }
              }
            }
          }
        }
      }
    },
    "/subcategories": {
      "get": {
        "tags": [
          "04. Subcategories"
        ],
        "summary": "Get Subcategories",
        "description": "GET /api/v1/subcategories. Query: pincode (required), optional latitude, longitude, userId. categoryId in query is not used by the API for filtering (filter client-side if needed).",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          },
          {
            "name": "categoryId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: categoryId",
            "example": "{{categoryId}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "post": {
        "tags": [
          "04. Subcategories"
        ],
        "summary": "Get Subcategories (POST)",
        "description": "Fetch subcategories by pincode in body. Optional: latitude, longitude, userId.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "pincode": "{{pincode}}"
                }
              }
            }
          }
        }
      }
    },
    "/products": {
      "get": {
        "tags": [
          "19. E2E Test (Run All)"
        ],
        "summary": "E2E - Get Products (get productId)",
        "description": "Endpoint for E2E - Get Products (get productId)",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "5"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/products/suggestions": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Product Suggestions",
        "description": "Endpoint for Product Suggestions",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          },
          {
            "name": "query",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: query",
            "example": "rice"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/products/{productId}": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Get Product by ID",
        "description": "Endpoint for Get Product by ID",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: productId"
          },
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/products/category/{categoryId}": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Products by Category",
        "description": "Endpoint for Products by Category",
        "parameters": [
          {
            "name": "categoryId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: categoryId"
          },
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "20"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/products/subcategory/{subCategoryId}": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Products by Subcategory",
        "description": "Endpoint for Products by Subcategory",
        "parameters": [
          {
            "name": "subCategoryId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: subCategoryId"
          },
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "20"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/products/popular": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Popular Products",
        "description": "Endpoint for Popular Products",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "20"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/products/offers": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Offer Products",
        "description": "Endpoint for Offer Products",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "20"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/brands": {
      "get": {
        "tags": [
          "06. Brands"
        ],
        "summary": "Get Top Brands",
        "description": "Fetch top brands for warehouse by pincode.",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "post": {
        "tags": [
          "06. Brands"
        ],
        "summary": "Get Top Brands (POST)",
        "description": "Fetch top brands by pincode in body.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "pincode": "{{pincode}}"
                }
              }
            }
          }
        }
      }
    },
    "/coupons": {
      "get": {
        "tags": [
          "07. Coupons"
        ],
        "summary": "Coupons for Home",
        "description": "Endpoint for Coupons for Home",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/coupons/cart": {
      "get": {
        "tags": [
          "07. Coupons"
        ],
        "summary": "Coupons for Cart",
        "description": "Endpoint for Coupons for Cart",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: pincode",
            "example": "{{pincode}}"
          },
          {
            "name": "cartValue",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: cartValue",
            "example": "500"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/cart/summary": {
      "get": {
        "tags": [
          "08. Cart"
        ],
        "summary": "Get Cart Summary",
        "description": "Endpoint for Get Cart Summary",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: warehouseId",
            "example": "{{warehouseId}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/cart/validate": {
      "get": {
        "tags": [
          "E2E - Multi Warehouse Cart Flow"
        ],
        "summary": "MW2 - Validate Cart",
        "description": "Endpoint for MW2 - Validate Cart",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: warehouseId",
            "example": "{{warehouseId_mw_2}}"
          },
          {
            "name": "addressId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: addressId",
            "example": "{{addressId}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/cart/items/{cartItemId}": {
      "patch": {
        "tags": [
          "08. Cart"
        ],
        "summary": "Update Cart Item",
        "description": "Endpoint for Update Cart Item",
        "parameters": [
          {
            "name": "cartItemId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: cartItemId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "quantity": 3
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "delete": {
        "tags": [
          "08. Cart"
        ],
        "summary": "Remove Cart Item",
        "description": "Endpoint for Remove Cart Item",
        "parameters": [
          {
            "name": "cartItemId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: cartItemId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/cart/apply-coupon": {
      "post": {
        "tags": [
          "08. Cart"
        ],
        "summary": "Apply Coupon",
        "description": "Endpoint for Apply Coupon",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "couponCode": "WELCOME10",
                  "warehouseId": "{{warehouseId}}"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/cart/coupon": {
      "delete": {
        "tags": [
          "08. Cart"
        ],
        "summary": "Remove Coupon",
        "description": "Endpoint for Remove Coupon",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: warehouseId",
            "example": "{{warehouseId}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/addresses": {
      "get": {
        "tags": [
          "09. Addresses"
        ],
        "summary": "Get Addresses",
        "description": "Endpoint for Get Addresses",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "19. E2E Test (Run All)"
        ],
        "summary": "E2E - Create Address",
        "description": "Endpoint for E2E - Create Address",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "label": "Home",
                  "line1": "123 Main St",
                  "city": "Bangalore",
                  "state": "Karnataka",
                  "pincode": "{{pincode}}",
                  "isDefault": true
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/addresses/{addressId}": {
      "patch": {
        "tags": [
          "09. Addresses"
        ],
        "summary": "Update Address",
        "description": "Endpoint for Update Address",
        "parameters": [
          {
            "name": "addressId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: addressId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "label": "Home",
                  "line1": "456 Oak Ave",
                  "city": "Bangalore",
                  "state": "Karnataka",
                  "pincode": "{{pincode}}"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "delete": {
        "tags": [
          "09. Addresses"
        ],
        "summary": "Delete Address",
        "description": "Endpoint for Delete Address",
        "parameters": [
          {
            "name": "addressId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: addressId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/addresses/{addressId}/set-default": {
      "patch": {
        "tags": [
          "09. Addresses"
        ],
        "summary": "Set Default Address",
        "description": "Endpoint for Set Default Address",
        "parameters": [
          {
            "name": "addressId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: addressId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/delivery/types": {
      "get": {
        "tags": [
          "19. E2E Test (Run All)"
        ],
        "summary": "E2E - Get Delivery Types",
        "description": "Endpoint for E2E - Get Delivery Types",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: warehouseId",
            "example": "{{warehouseId}}"
          },
          {
            "name": "addressId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: addressId",
            "example": "{{addressId}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/delivery/slots": {
      "get": {
        "tags": [
          "10. Delivery (Types & Slots)"
        ],
        "summary": "Get Delivery Slots",
        "description": "GET /api/v1/delivery/slots. Returns available delivery slots for warehouse and date. When addressId or pincode provided, only slots for that route (and legacy slots) are returned. Slot id (e.g. 09:00-12:00) is used as deliverySlot in Create Order (SCHEDULED).",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Required",
            "example": "{{warehouseId}}"
          },
          {
            "name": "date",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Required, YYYY-MM-DD",
            "example": "{{deliveryDate}}"
          },
          {
            "name": "addressId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Optional; for route filtering (slots for address's route)",
            "example": "{{addressId}}"
          },
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Optional; for route filtering when addressId not sent",
            "example": "{{pincode}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/delivery/calculate-charge": {
      "post": {
        "tags": [
          "10. Delivery (Types & Slots)"
        ],
        "summary": "Calculate Delivery Charge",
        "description": "POST /api/v1/delivery/calculate-charge. Body: pincode (required), subtotal (required), warehouseId (optional), latitude/longitude (optional for nearest warehouse when warehouseId omitted). Returns deliveryCharge, total, warehouse, freeDeliveryThreshold, isFreeDelivery.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "pincode": "{{pincode}}",
                  "subtotal": 500,
                  "warehouseId": "{{warehouseId}}",
                  "latitude": null,
                  "longitude": null
                }
              }
            }
          }
        }
      }
    },
    "/delivery/stores/pickup": {
      "get": {
        "tags": [
          "10. Delivery (Types & Slots)"
        ],
        "summary": "Pickup Stores",
        "description": "GET /api/v1/delivery/stores/pickup. Returns pickup stores (warehouses with self-pickup). Query: warehouseId, pincode optional.",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Optional",
            "example": "{{warehouseId}}"
          },
          {
            "name": "pincode",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Optional",
            "example": "{{pincode}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/delivery/stores/{storeId}/pickup-slots": {
      "get": {
        "tags": [
          "10. Delivery (Types & Slots)"
        ],
        "summary": "Pickup Store Slots",
        "description": "GET /api/v1/delivery/stores/:storeId/pickup-slots. Path param storeId is the warehouse/store UUID (set {{storeId}} from GET /delivery/stores/pickup response). Query date optional: when set uses PickupSlot + blackout; when omitted returns legacy slots.",
        "parameters": [
          {
            "name": "storeId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: storeId"
          },
          {
            "name": "date",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Optional; when provided uses PickupSlot table and blackout; when omitted uses legacy pickupTimeSlots",
            "example": "{{deliveryDate}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/orders": {
      "post": {
        "tags": [
          "E2E - Multi Warehouse Cart Flow"
        ],
        "summary": "MW2 - Checkout Order",
        "description": "Endpoint for MW2 - Checkout Order",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "warehouseId": "{{warehouseId_mw_2}}",
                  "deliveryType": "FAST",
                  "addressId": "{{addressId}}"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "get": {
        "tags": [
          "19. E2E Test (Run All)"
        ],
        "summary": "E2E - Get Orders",
        "description": "Endpoint for E2E - Get Orders",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "5"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}": {
      "get": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Get Order by ID",
        "description": "Endpoint for Get Order by ID",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/slots/availability": {
      "get": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Slots Availability",
        "description": "Same logic as GET /api/v1/delivery/slots. Returns slots for warehouse and date; slot id may be Partner format (09:00-12:00) or default. Use slot id as deliverySlot in Create Order (SCHEDULED).",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: warehouseId",
            "example": "{{warehouseId}}"
          },
          {
            "name": "date",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: date",
            "example": "{{deliveryDate}}"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/cancel": {
      "patch": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Cancel Order",
        "description": "Endpoint for Cancel Order",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "reason": "Changed my mind"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/tracking": {
      "get": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Track Order",
        "description": "Endpoint for Track Order",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/tracking/live": {
      "get": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Live Tracking",
        "description": "Endpoint for Live Tracking",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/tracking/location": {
      "post": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Update Delivery Location",
        "description": "Endpoint for Update Delivery Location",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "latitude": 28.6139,
                  "longitude": 77.209,
                  "accuracy": 10
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/delivery": {
      "patch": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Modify Delivery",
        "description": "Endpoint for Modify Delivery",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "deliveryDate": "{{deliveryDate}}",
                  "deliverySlot": "AFTERNOON"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/items": {
      "patch": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Modify Order Items",
        "description": "Endpoint for Modify Order Items",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "items": [
                    {
                      "productId": "{{productId}}",
                      "quantity": 2
                    }
                  ],
                  "removeItems": []
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/items/{orderItemId}/cancel": {
      "post": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Cancel Order Item",
        "description": "Endpoint for Cancel Order Item",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          },
          {
            "name": "orderItemId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderItemId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "reason": "Wrong item"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/reorder": {
      "post": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Reorder",
        "description": "Endpoint for Reorder",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/invoice": {
      "get": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Get Invoice",
        "description": "Endpoint for Get Invoice",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/assign-agent": {
      "post": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Assign Agent",
        "description": "Endpoint for Assign Agent",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "agentId": "{{userId}}"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/confirm": {
      "post": {
        "tags": [
          "11. Orders"
        ],
        "summary": "Confirm Order",
        "description": "Endpoint for Confirm Order",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/payments/razorpay/webhook": {
      "post": {
        "tags": [
          "12. Payments"
        ],
        "summary": "Razorpay Webhook",
        "description": "Razorpay webhook (no auth; uses signature verification). For local testing only; production uses Razorpay dashboard URL.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "event": "payment.captured",
                  "payload": {}
                }
              }
            }
          }
        }
      }
    },
    "/payments/initiate": {
      "post": {
        "tags": [
          "12. Payments"
        ],
        "summary": "Initiate Payment",
        "description": "Endpoint for Initiate Payment",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "orderId": "{{orderId}}",
                  "method": "COD"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/payments/verify": {
      "post": {
        "tags": [
          "12. Payments"
        ],
        "summary": "Verify Payment",
        "description": "Endpoint for Verify Payment",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "orderId": "{{orderId}}",
                  "razorpayOrderId": "",
                  "razorpayPaymentId": "",
                  "razorpaySignature": ""
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/payments/{paymentId}": {
      "get": {
        "tags": [
          "12. Payments"
        ],
        "summary": "Get Payment Status",
        "description": "Get payment status by paymentId. Expected: 200.",
        "parameters": [
          {
            "name": "paymentId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: paymentId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/payments/{paymentId}/retry": {
      "post": {
        "tags": [
          "12. Payments"
        ],
        "summary": "Retry Payment",
        "description": "Retry a failed payment. No body. Expected: 200/201.",
        "parameters": [
          {
            "name": "paymentId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: paymentId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/orders/{orderId}/return": {
      "post": {
        "tags": [
          "13. Returns"
        ],
        "summary": "Initiate Return",
        "description": "POST /api/v1/orders/:orderId/return. reason required (10–500 chars). orderItemId optional (full-order return if omitted). notes optional.",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "reason": "Product damaged on delivery — min 10 chars required",
                  "orderItemId": "{{orderItemId}}",
                  "notes": "Optional notes, max 1000 chars"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "get": {
        "tags": [
          "13. Returns"
        ],
        "summary": "Get Return Status",
        "description": "Endpoint for Get Return Status",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/returns": {
      "get": {
        "tags": [
          "13. Returns"
        ],
        "summary": "Get My Returns",
        "description": "Endpoint for Get My Returns",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "20"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/returns/{returnId}/cancel": {
      "post": {
        "tags": [
          "13. Returns"
        ],
        "summary": "Cancel Return",
        "description": "Endpoint for Cancel Return",
        "parameters": [
          {
            "name": "returnId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: returnId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/notifications": {
      "get": {
        "tags": [
          "14. Notifications"
        ],
        "summary": "Get Notifications",
        "description": "Endpoint for Get Notifications",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "20"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/notifications/unread-count": {
      "get": {
        "tags": [
          "14. Notifications"
        ],
        "summary": "Unread Count",
        "description": "Endpoint for Unread Count",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/notifications/{notificationId}": {
      "get": {
        "tags": [
          "14. Notifications"
        ],
        "summary": "Get Notification",
        "description": "Endpoint for Get Notification",
        "parameters": [
          {
            "name": "notificationId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: notificationId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/notifications/{notificationId}/read": {
      "patch": {
        "tags": [
          "14. Notifications"
        ],
        "summary": "Mark as Read",
        "description": "Endpoint for Mark as Read",
        "parameters": [
          {
            "name": "notificationId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: notificationId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/notifications/read-all": {
      "patch": {
        "tags": [
          "14. Notifications"
        ],
        "summary": "Mark All Read",
        "description": "Endpoint for Mark All Read",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/products/{productId}/ratings": {
      "post": {
        "tags": [
          "15. Ratings & Reviews"
        ],
        "summary": "Add/Update Product Rating",
        "description": "Endpoint for Add/Update Product Rating",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: productId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "rating": 5,
                  "review": "Great product!"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "get": {
        "tags": [
          "15. Ratings & Reviews"
        ],
        "summary": "Get Product Ratings",
        "description": "Endpoint for Get Product Ratings",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: productId"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: page",
            "example": "1"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: limit",
            "example": "20"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/ratings/my-ratings": {
      "get": {
        "tags": [
          "15. Ratings & Reviews"
        ],
        "summary": "My Ratings",
        "description": "Endpoint for My Ratings",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/ratings/{ratingId}": {
      "patch": {
        "tags": [
          "15. Ratings & Reviews"
        ],
        "summary": "Update Rating",
        "description": "Endpoint for Update Rating",
        "parameters": [
          {
            "name": "ratingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: ratingId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "rating": 4,
                  "review": "Updated review"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "delete": {
        "tags": [
          "15. Ratings & Reviews"
        ],
        "summary": "Delete Rating",
        "description": "Endpoint for Delete Rating",
        "parameters": [
          {
            "name": "ratingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: ratingId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/wishlist/add": {
      "post": {
        "tags": [
          "16. Wishlist"
        ],
        "summary": "Add to Wishlist",
        "description": "Add a product to wishlist. Requires warehouseId and productId. Optional: status (ACTIVE|INACTIVE).",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "warehouseId": "{{warehouseId}}",
                  "productId": "{{productId}}"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/wishlist": {
      "get": {
        "tags": [
          "16. Wishlist"
        ],
        "summary": "Get Wishlist",
        "description": "Endpoint for Get Wishlist",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/wishlist/remove/{productId}": {
      "delete": {
        "tags": [
          "16. Wishlist"
        ],
        "summary": "Remove from Wishlist",
        "description": "Remove a product from wishlist by productId. Expected: 200.",
        "parameters": [
          {
            "name": "productId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: productId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/wishlist/clear": {
      "patch": {
        "tags": [
          "16. Wishlist"
        ],
        "summary": "Clear Wishlist",
        "description": "Soft-clear all wishlist items. No body. Expected: 200.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/chat": {
      "post": {
        "tags": [
          "17. Chat"
        ],
        "summary": "Send Message",
        "description": "Endpoint for Send Message",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "orderId": "{{orderId}}",
                  "message": "When will my order arrive?"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/chat/orders/{orderId}": {
      "get": {
        "tags": [
          "17. Chat"
        ],
        "summary": "Get Order Chat",
        "description": "Endpoint for Get Order Chat",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/chat/conversations": {
      "get": {
        "tags": [
          "17. Chat"
        ],
        "summary": "Get Conversations",
        "description": "Endpoint for Get Conversations",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/chat/{messageId}/read": {
      "patch": {
        "tags": [
          "17. Chat"
        ],
        "summary": "Mark Message Read",
        "description": "Endpoint for Mark Message Read",
        "parameters": [
          {
            "name": "messageId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: messageId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/chat/orders/{orderId}/read-all": {
      "patch": {
        "tags": [
          "17. Chat"
        ],
        "summary": "Mark Order Chat Read",
        "description": "Endpoint for Mark Order Chat Read",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/app/intro-screens": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Intro Screens",
        "description": "Endpoint for Intro Screens",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/app-content-links": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "App Content Links (Get All)",
        "description": "Get all app content links. Auth required.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Create App Content Link",
        "description": "Create app content link. Required: roleName, title, titleType, subTitle, icon, linkPath.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "roleName": "CONSUMER",
                  "title": "Help",
                  "titleType": "TEXT",
                  "subTitle": "FAQ",
                  "icon": "help",
                  "linkPath": "/help"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/app-content-links/{appContentLinkId}": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "App Content Link by ID",
        "description": "Get app content link by ID.",
        "parameters": [
          {
            "name": "appContentLinkId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: appContentLinkId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Update App Content Link",
        "description": "Update app content link by ID. All fields optional.",
        "parameters": [
          {
            "name": "appContentLinkId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: appContentLinkId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "title": "Help Center",
                  "linkPath": "/help-center"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "delete": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Delete App Content Link",
        "description": "Delete app content link by ID.",
        "parameters": [
          {
            "name": "appContentLinkId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: appContentLinkId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/banner": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Banners (Get All)",
        "description": "Get all banners. Auth required. Optional query: section, isActive.",
        "parameters": [
          {
            "name": "section",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: section"
          },
          {
            "name": "isActive",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Query parameter: isActive",
            "example": "true"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Create Banner",
        "description": "Create banner. Required: title, imageUrl, section. Optional: priority, redirectUrl, isActive, status (ACTIVE|INACTIVE).",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "title": "Summer Sale",
                  "imageUrl": "https://example.com/banner.jpg",
                  "section": "HOME",
                  "priority": 1,
                  "redirectUrl": "https://example.com",
                  "isActive": true
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/banner/{bannerId}": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Banner by ID",
        "description": "Get banner by ID. Auth required.",
        "parameters": [
          {
            "name": "bannerId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: bannerId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/banner/update/{bannerId}": {
      "put": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Update Banner",
        "description": "Update banner by ID.",
        "parameters": [
          {
            "name": "bannerId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: bannerId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "title": "Updated Title",
                  "imageUrl": "https://example.com/banner2.jpg",
                  "section": "HOME",
                  "isActive": true
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/banner/delete/{bannerId}": {
      "delete": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Soft Delete Banner",
        "description": "Soft delete banner. Expected: 200.",
        "parameters": [
          {
            "name": "bannerId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: bannerId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/banner/restore/{bannerId}": {
      "patch": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Restore Banner",
        "description": "Restore soft-deleted banner. Expected: 200.",
        "parameters": [
          {
            "name": "bannerId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: bannerId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/suggestion": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Suggestions (Get All)",
        "description": "Get all suggestions. No auth required.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "post": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Create Suggestion",
        "description": "Create suggestion. Required: suggestion, roleName. No auth in codebase.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "suggestion": "Add dark mode",
                  "roleName": "CONSUMER"
                }
              }
            }
          }
        }
      }
    },
    "/suggestion/{suggestionId}": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Suggestion by ID",
        "description": "Get suggestion by ID. ID is UUID.",
        "parameters": [
          {
            "name": "suggestionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: suggestionId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "put": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Update Suggestion",
        "description": "Update suggestion by ID. Optional: suggestion, roleName.",
        "parameters": [
          {
            "name": "suggestionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: suggestionId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "suggestion": "Add dark mode and notifications",
                  "roleName": "CONSUMER"
                }
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Delete Suggestion",
        "description": "Soft delete suggestion by ID.",
        "parameters": [
          {
            "name": "suggestionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: suggestionId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/deliveryrelque": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Delivery Related Questions (Get All)",
        "description": "Get all delivery-related questions. No auth required.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "post": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Create Delivery Question",
        "description": "Create delivery question. Required: question (min 3 chars). No auth in codebase.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "question": "What are your delivery hours?"
                }
              }
            }
          }
        }
      }
    },
    "/deliveryrelque/{deliveryRelQueId}": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Delivery Question by ID",
        "description": "Get delivery question by ID.",
        "parameters": [
          {
            "name": "deliveryRelQueId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: deliveryRelQueId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      },
      "put": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Update Delivery Question",
        "description": "Update delivery question by ID. Optional: question, isActive.",
        "parameters": [
          {
            "name": "deliveryRelQueId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: deliveryRelQueId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "question": "Updated question text",
                  "isActive": true
                }
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Delete Delivery Question",
        "description": "Delete delivery question by ID.",
        "parameters": [
          {
            "name": "deliveryRelQueId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: deliveryRelQueId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/order-rating": {
      "post": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Order Rating (create)",
        "description": "Create order rating. Required: userId, orderId. Optional: deliveryBoyId, orderRating (1-5), deliveryRating (1-5), orderReview, deliveryReview, deliveryQuestions (array of { questionId, answer }). No auth in codebase.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "userId": "{{userId}}",
                  "orderId": "{{orderId}}",
                  "orderRating": 5,
                  "deliveryRating": 5,
                  "orderReview": "Good experience",
                  "deliveryReview": "On time",
                  "deliveryBoyId": ""
                }
              }
            }
          }
        }
      },
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Get Order Ratings",
        "description": "Get all order ratings (e.g. for admin). No auth in codebase.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/order-rating/order/{orderId}": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Get Order Rating by Order ID",
        "description": "Get rating for a specific order by orderId.",
        "parameters": [
          {
            "name": "orderId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/order-rating/{orderRatingId}": {
      "put": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Update Order Rating",
        "description": "Update order rating by ID. Body fields as needed.",
        "parameters": [
          {
            "name": "orderRatingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderRatingId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "orderRating": 4,
                  "orderReview": "Updated review"
                }
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Delete Order Rating",
        "description": "Delete order rating by ID.",
        "parameters": [
          {
            "name": "orderRatingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "URL path parameter: orderRatingId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/internal/order-sync/status": {
      "post": {
        "tags": [
          "20. Internal — order sync (delivery API)"
        ],
        "summary": "POST order status sync",
        "description": "POST /api/v1/internal/order-sync/status. Body: orderId, status (required); agentId, deliveredAt, eventId optional.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request / Validation Error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "orderId": "{{orderId}}",
                  "status": "DELIVERED",
                  "agentId": null,
                  "deliveredAt": "2026-04-06T10:00:00.000Z",
                  "eventId": "optional-idempotency-key"
                }
              }
            }
          }
        }
      }
    },
    "/wallet/balance": {
      "get": {
        "tags": [
          "12. Payments"
        ],
        "summary": "Get Wallet Balance",
        "description": "Retrieves the user's current wallet balance.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/wallet/transactions": {
      "get": {
        "tags": [
          "12. Payments"
        ],
        "summary": "Get Wallet Transactions",
        "description": "Retrieves transaction history for the user's wallet.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/wallet/add-funds": {
      "post": {
        "tags": [
          "12. Payments"
        ],
        "summary": "Add Wallet Funds",
        "description": "Initiates adding funds to the user's wallet.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "example": {
                  "amount": 100
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/vehicles": {
      "get": {
        "tags": [
          "18. Vehicles"
        ],
        "summary": "Get Vehicles by Warehouse",
        "description": "Fetches active vehicles assigned to a warehouse.",
        "parameters": [
          {
            "name": "warehouseId",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: warehouseId"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/vehicles/{id}/track": {
      "get": {
        "tags": [
          "18. Vehicles"
        ],
        "summary": "Get Vehicle Tracking Data",
        "description": "Fetches real-time tracking data/location details for a specific vehicle.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "path parameter: id"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/delivery/schedule": {
      "get": {
        "tags": [
          "10. Delivery (Types & Slots)"
        ],
        "summary": "Get Delivery Schedule",
        "description": "Fetches the upcoming delivery schedule for a village/pincode.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/delivery/schedule/villages": {
      "get": {
        "tags": [
          "10. Delivery (Types & Slots)"
        ],
        "summary": "Get Serviceable Villages",
        "description": "Fetches all serviceable villages under the delivery schedule.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/delivery/schedule/detail": {
      "get": {
        "tags": [
          "10. Delivery (Types & Slots)"
        ],
        "summary": "Get Village Schedule Detail",
        "description": "Fetches detailed village schedule configuration by routeName.",
        "parameters": [
          {
            "name": "routeName",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: routeName"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/referral/details": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Get Referral Details",
        "description": "Get user's referral code and referred friends statistics.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/loyalty/balance": {
      "get": {
        "tags": [
          "18. App & Misc"
        ],
        "summary": "Get Loyalty Balance",
        "description": "Retrieves the user's loyalty points balance.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/products/shop-by-need": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Get Shop by Need Products",
        "description": "Gets products belonging to categories marked as SPECIAL.",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: pincode"
          },
          {
            "name": "latitude",
            "in": "query",
            "required": false,
            "schema": {
              "type": "number"
            },
            "description": "query parameter: latitude"
          },
          {
            "name": "longitude",
            "in": "query",
            "required": false,
            "schema": {
              "type": "number"
            },
            "description": "query parameter: longitude"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer"
            },
            "description": "query parameter: page"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer"
            },
            "description": "query parameter: limit"
          },
          {
            "name": "sortBy",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: sortBy"
          },
          {
            "name": "sortOrder",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: sortOrder"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/products/daily-deals": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Get Daily Deals Products",
        "description": "Gets products tagged with daily deals or highly discounted.",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: pincode"
          },
          {
            "name": "latitude",
            "in": "query",
            "required": false,
            "schema": {
              "type": "number"
            },
            "description": "query parameter: latitude"
          },
          {
            "name": "longitude",
            "in": "query",
            "required": false,
            "schema": {
              "type": "number"
            },
            "description": "query parameter: longitude"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer"
            },
            "description": "query parameter: page"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer"
            },
            "description": "query parameter: limit"
          },
          {
            "name": "sortBy",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: sortBy"
          },
          {
            "name": "sortOrder",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: sortOrder"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
    "/products/weekly-specials": {
      "get": {
        "tags": [
          "05. Products"
        ],
        "summary": "Get Weekly Specials Products",
        "description": "Gets weekly special products or promotional deals.",
        "parameters": [
          {
            "name": "pincode",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: pincode"
          },
          {
            "name": "latitude",
            "in": "query",
            "required": false,
            "schema": {
              "type": "number"
            },
            "description": "query parameter: latitude"
          },
          {
            "name": "longitude",
            "in": "query",
            "required": false,
            "schema": {
              "type": "number"
            },
            "description": "query parameter: longitude"
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer"
            },
            "description": "query parameter: page"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer"
            },
            "description": "query parameter: limit"
          },
          {
            "name": "sortBy",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: sortBy"
          },
          {
            "name": "sortOrder",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "query parameter: sortOrder"
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "400": {
            "description": "Bad Request"
          },
          "401": {
            "description": "Unauthorized"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    }
  }
};
