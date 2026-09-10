<?php

declare(strict_types=1);

/**
 * Export one legacy member's Outline-backed diaries to a root-only JSON file.
 *
 * Usage:
 *   php outline_export.php <legacy-app-root> <member-id> <output-json>
 */

if ($argc !== 4 || !ctype_digit($argv[2]) || (int)$argv[2] <= 0) {
    fwrite(STDERR, "Usage: php outline_export.php <legacy-app-root> <member-id> <output-json>\n");
    exit(64);
}

$appRoot = rtrim($argv[1], '/');
$memberId = (int)$argv[2];
$outputPath = $argv[3];
if (dirname($outputPath) !== '/tmp') {
    fwrite(STDERR, "Output must be a direct child of /tmp\n");
    exit(64);
}

defined('YII_DEBUG') or define('YII_DEBUG', false);
defined('YII_ENV') or define('YII_ENV', 'prod');

require $appRoot . '/vendor/autoload.php';
require $appRoot . '/vendor/yiisoft/yii2/Yii.php';
require $appRoot . '/common/config/bootstrap.php';
require $appRoot . '/console/config/bootstrap.php';

$config = yii\helpers\ArrayHelper::merge(
    require $appRoot . '/common/config/main.php',
    require $appRoot . '/common/config/main-local.php',
    require $appRoot . '/console/config/main.php',
    require $appRoot . '/console/config/main-local.php'
);

Yii::$classMap['yii\db\mysql\JsonExpressionBuilder'] = '@common/replaces/JsonExpressionBuilder.php';
$application = new yii\console\Application($config);
$client = new addons\RfDiary\services\OutlineDiaryClient();
if (!$client->isConfigured()) {
    fwrite(STDERR, "Outline diary service is not configured\n");
    exit(69);
}

$items = array_map(static fn(array $item): array => [
    'legacyId' => (string)($item['id'] ?? ''),
    'content' => (string)($item['content'] ?? ''),
    'images' => is_array($item['images'] ?? null) ? $item['images'] : [],
    'voice' => $item['voice'] ?? null,
    'hour' => isset($item['hour']) ? (int)$item['hour'] : null,
    'minute' => isset($item['minute']) ? (int)$item['minute'] : null,
    'mood' => (string)($item['mood'] ?? 'calm'),
    'tags' => is_array($item['tags'] ?? null) ? $item['tags'] : [],
    'linkedCards' => is_array($item['linkedCards'] ?? null) ? $item['linkedCards'] : [],
    'visibility' => (string)($item['visibility'] ?? 'PRIVATE'),
    'type' => (string)($item['type'] ?? 'default'),
    'date' => (string)($item['date'] ?? ''),
    'createdAt' => (string)($item['createdAt'] ?? ''),
    'updatedAt' => (string)($item['updatedAt'] ?? ''),
], $client->listForMember($memberId));

$payload = [
    'schemaVersion' => 1,
    'source' => 'outline',
    'legacyMemberId' => $memberId,
    'diaries' => $items,
];
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
if (file_put_contents($outputPath, $json, LOCK_EX) === false) {
    fwrite(STDERR, "Unable to write export\n");
    exit(74);
}
chmod($outputPath, 0600);

fwrite(STDOUT, json_encode([
    'bytes' => strlen($json),
    'sha256' => hash('sha256', $json),
    'count' => count($items),
], JSON_UNESCAPED_SLASHES) . PHP_EOL);
