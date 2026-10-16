// This file overwrites the stock UV config.js

self.__uv$config = {
	prefix: "./triple/hd/",
	encodeUrl: Ultraviolet.codec.xor.encode,
	decodeUrl: Ultraviolet.codec.xor.decode,
	handler: "./e/handler.js",
	client: "./e/client.js",
	bundle: "./e/bundle.js",
	config: "./e/config.js",
	sw: "./e/worker.js",
};
