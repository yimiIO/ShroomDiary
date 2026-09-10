<?php

declare(strict_types=1);

/**
 * Export one legacy Shroom user's product data into a root-only JSON file.
 * Surf-school commerce, identity, and staff data are deliberately excluded.
 *
 * Usage:
 *   php legacy_export.php <legacy-app-root> <mobile> <output-json>
 */

if ($argc !== 4) {
    fwrite(STDERR, "Usage: php legacy_export.php <legacy-app-root> <mobile> <output-json>\n");
    exit(64);
}

[$script, $appRoot, $mobile, $outputPath] = $argv;
$appRoot = rtrim($appRoot, '/');

if (!preg_match('/^1[3-9]\d{9}$/', $mobile)) {
    fwrite(STDERR, "Invalid mobile format\n");
    exit(64);
}

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
$db = $application->db;
$prefix = (string)$db->tablePrefix;

$table = static fn(string $logicalName): string => $prefix . $logicalName;
$decodeJson = static function ($value, array $fallback = []): array {
    if (is_array($value)) {
        return $value;
    }
    if ($value === null || $value === '') {
        return $fallback;
    }
    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : $fallback;
};
$integerOrNull = static fn($value): ?int => $value === null || $value === '' ? null : (int)$value;

$members = (new yii\db\Query())
    ->select(['id', 'mobile', 'nickname', 'head_portrait', 'status', 'created_at', 'updated_at'])
    ->from($table('member'))
    ->where(['mobile' => $mobile])
    ->orderBy(['status' => SORT_DESC, 'created_at' => SORT_ASC])
    ->all($db);

if (count($members) !== 1 || (int)$members[0]['status'] !== 1) {
    fwrite(STDERR, "Expected exactly one active legacy member\n");
    exit(3);
}

$member = $members[0];
$memberId = (int)$member['id'];
$rows = static function (string $logicalName) use ($db, $table, $memberId): array {
    return (new yii\db\Query())
        ->from($table($logicalName))
        ->where(['member_id' => $memberId])
        ->orderBy(['id' => SORT_ASC])
        ->all($db);
};

$diaries = array_map(static fn(array $row): array => [
    'legacyId' => (int)$row['id'],
    'content' => (string)$row['content'],
    'images' => $decodeJson($row['images'] ?? null),
    'voice' => $decodeJson($row['voice'] ?? null),
    'hour' => $integerOrNull($row['hour'] ?? null),
    'minute' => $integerOrNull($row['minute'] ?? null),
    'type' => (string)($row['type'] ?? ''),
    'linkedCards' => $decodeJson($row['linked_cards'] ?? null),
    'visibility' => (string)($row['visibility'] ?? ''),
    'mood' => (string)($row['mood'] ?? ''),
    'tags' => $decodeJson($row['tags'] ?? null),
    'createdAt' => $integerOrNull($row['created_at'] ?? null),
    'updatedAt' => $integerOrNull($row['updated_at'] ?? null),
], $rows('addon_diary'));

$todos = array_map(static fn(array $row): array => [
    'legacyId' => (string)$row['id'],
    'content' => (string)$row['content'],
    'deadline' => $row['deadline'] ?: null,
    'status' => (string)$row['status'],
    'tags' => $decodeJson($row['tags'] ?? null),
    'completedAt' => $integerOrNull($row['completed_at'] ?? null),
    'createdAt' => $integerOrNull($row['created_at'] ?? null),
    'updatedAt' => $integerOrNull($row['updated_at'] ?? null),
], $rows('addon_todo'));

$cards = array_map(static fn(array $row): array => [
    'legacyId' => (int)$row['id'],
    'seedSentence' => (string)$row['seed_sentence'],
    'myUnderstanding' => (string)($row['my_understanding'] ?? ''),
    'usageItems' => $decodeJson($row['usage_items'] ?? null),
    'practiceCases' => $decodeJson($row['practice_cases'] ?? null),
    'tags' => $decodeJson($row['tags'] ?? null),
    'visibility' => (string)($row['visibility'] ?? ''),
    'resonanceCount' => (int)($row['resonance_count'] ?? 0),
    'favoriteCount' => (int)($row['favorite_count'] ?? 0),
    'quoteCount' => (int)($row['quote_count'] ?? 0),
    'lastPracticeAt' => $integerOrNull($row['last_practice_time'] ?? null),
    'createdAt' => $integerOrNull($row['created_at'] ?? null),
    'updatedAt' => $integerOrNull($row['updated_at'] ?? null),
], $rows('addon_shroom_card'));

$memoryNodes = array_map(static fn(array $row): array => [
    'legacyId' => (int)$row['id'],
    'sourceType' => (string)$row['source_type'],
    'legacySourceId' => (string)$row['source_id'],
    'summary' => (string)$row['summary'],
    'content' => $row['content'] === null ? null : (string)$row['content'],
    'tags' => $decodeJson($row['tags'] ?? null),
    'emotionScore' => (float)$row['emotion_score'],
    'importanceScore' => (float)$row['importance_score'],
    'lastViewedAt' => $integerOrNull($row['last_viewed_at'] ?? null),
    'viewCount' => (int)$row['view_count'],
    'likeCount' => (int)$row['like_count'],
    'skipCount' => (int)$row['skip_count'],
    'openCount' => (int)$row['open_count'],
    'sourceCreatedAt' => $integerOrNull($row['source_created_at'] ?? null),
    'sourceUpdatedAt' => $integerOrNull($row['source_updated_at'] ?? null),
    'createdAt' => $integerOrNull($row['created_at'] ?? null),
    'updatedAt' => $integerOrNull($row['updated_at'] ?? null),
], $rows('addon_memory_node'));

$memoryFeedback = array_map(static fn(array $row): array => [
    'legacyId' => (int)$row['id'],
    'legacyNodeId' => (int)$row['node_id'],
    'action' => (string)$row['action'],
    'createdAt' => $integerOrNull($row['created_at'] ?? null),
    'updatedAt' => $integerOrNull($row['updated_at'] ?? null),
], $rows('addon_memory_feedback'));

$payload = [
    'schemaVersion' => 1,
    'user' => [
        'legacyId' => $memberId,
        'mobile' => (string)$member['mobile'],
        'nickname' => (string)($member['nickname'] ?? ''),
        'avatarUrl' => (string)($member['head_portrait'] ?? ''),
        'createdAt' => $integerOrNull($member['created_at'] ?? null),
        'updatedAt' => $integerOrNull($member['updated_at'] ?? null),
    ],
    'diaries' => $diaries,
    'todos' => $todos,
    'cards' => $cards,
    'memoryNodes' => $memoryNodes,
    'memoryFeedback' => $memoryFeedback,
];

$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
if (file_put_contents($outputPath, $json, LOCK_EX) === false) {
    fwrite(STDERR, "Unable to write export\n");
    exit(74);
}
chmod($outputPath, 0600);

$practiceCount = array_sum(array_map(static fn(array $card): int => count($card['practiceCases']), $cards));
$summary = [
    'bytes' => strlen($json),
    'sha256' => hash('sha256', $json),
    'counts' => [
        'users' => 1,
        'diaries' => count($diaries),
        'todos' => count($todos),
        'cards' => count($cards),
        'practices' => $practiceCount,
        'memoryNodes' => count($memoryNodes),
        'memoryFeedback' => count($memoryFeedback),
    ],
];

fwrite(STDOUT, json_encode($summary, JSON_UNESCAPED_SLASHES) . PHP_EOL);
