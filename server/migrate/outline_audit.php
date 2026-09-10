<?php

declare(strict_types=1);

/**
 * Read-only metadata audit for one member's Outline-backed diaries.
 * Diary content and document identifiers are never emitted.
 *
 * Usage:
 *   php outline_audit.php <legacy-app-root> <member-id>
 */

if ($argc !== 3 || !ctype_digit($argv[2]) || (int)$argv[2] <= 0) {
    fwrite(STDERR, "Usage: php outline_audit.php <legacy-app-root> <member-id>\n");
    exit(64);
}

$appRoot = rtrim($argv[1], '/');
$memberId = (int)$argv[2];

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

$items = $client->listForMember($memberId);
$byMonth = [];
$visibilities = [];
$imageCount = 0;
$voiceCount = 0;
$linkedCardCount = 0;
$dates = [];

foreach ($items as $item) {
    $date = (string)($item['date'] ?? '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $dates[] = $date;
        $month = substr($date, 0, 7);
        $byMonth[$month] = ($byMonth[$month] ?? 0) + 1;
    }
    $visibility = (string)($item['visibility'] ?? 'PRIVATE');
    $visibilities[$visibility] = ($visibilities[$visibility] ?? 0) + 1;
    $imageCount += count(is_array($item['images'] ?? null) ? $item['images'] : []);
    $voiceCount += empty($item['voice']) ? 0 : 1;
    $linkedCardCount += count(is_array($item['linkedCards'] ?? null) ? $item['linkedCards'] : []);
}

ksort($byMonth);
ksort($visibilities);
$summary = [
    'count' => count($items),
    'oldest_date' => $dates ? min($dates) : null,
    'newest_date' => $dates ? max($dates) : null,
    'by_month' => $byMonth,
    'current_month_count' => $byMonth[date('Y-m')] ?? 0,
    'visibilities' => $visibilities,
    'payload_shape' => [
        'images' => $imageCount,
        'voice_entries' => $voiceCount,
        'linked_cards' => $linkedCardCount,
    ],
];

fwrite(STDOUT, json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
