<?php

return [
    'enabled' => env('LAZYCHAT_WEBHOOKS_ENABLED', true),

    'timeout' => env('LAZYCHAT_WEBHOOK_TIMEOUT', 5),

    'product_upsert' => [
        'url' => env('LAZYCHAT_PRODUCT_UPSERT_URL', 'https://flow.lazychat.io/api/exec/flows/6a02dcadf00b1c2c40678385/fBML0cvz4Kkq'),
        'token' => env('LAZYCHAT_PRODUCT_UPSERT_TOKEN', '88c9956d0532bb4ff009389066b86be13c5e1b717818283c9e6a70ee9668254a'),
    ],

    'product_delete' => [
        'url' => env('LAZYCHAT_PRODUCT_DELETE_URL', 'https://flow.lazychat.io/api/exec/flows/6a02dcadf00b1c2c40678385/FXfUG5jBNVc0'),
        'token' => env('LAZYCHAT_PRODUCT_DELETE_TOKEN', '1aa94467884b59614d01236a76bdfa11996d4726191dd2a043fdae1c89001671'),
    ],

    'testing' => [
        'enabled' => env('LAZYCHAT_TEST_ENABLED', false),
        'token' => env('LAZYCHAT_TEST_TOKEN'),
        'auth' => [
            'email' => env('LAZYCHAT_TEST_LOGIN_EMAIL', 'mueedibnesami.anoy@gmail.com'),
            'password' => env('LAZYCHAT_TEST_LOGIN_PASSWORD', '12345678'),
            'token_cache_path' => env('LAZYCHAT_TEST_TOKEN_CACHE_PATH', 'lazychat-test-auth.json'),
        ],
    ],
];
