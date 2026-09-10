<?php

declare(strict_types=1);

/**
 * Read-only audit for one legacy Shroom user. It emits counts and metadata only.
 *
 * Usage:
 *   php legacy_audit.php <legacy-app-root> <mobile>
 */

if ($argc !== 3) {
    fwrite(STDERR, "Usage: php legacy_audit.php <legacy-app-root> <mobile>\n");
    exit(64);
}

[$script, $appRoot, $mobile] = $argv;
$appRoot = rtrim($appRoot, '/');

if (!preg_match('/^1[3-9]\d{9}$/', $mobile)) {
    fwrite(STDERR, "Invalid mobile format\n");
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

$physicalTable = static function (string $name) use ($prefix): string {
    return $prefix . $name;
};

$memberTable = $physicalTable('member');
if ($db->schema->getTableSchema($memberTable, true) === null) {
    fwrite(STDERR, "Legacy member table not found\n");
    exit(69);
}

$members = (new yii\db\Query())
    ->select(['id', 'status', 'password_hash'])
    ->from($memberTable)
    ->where(['mobile' => $mobile])
    ->orderBy(['status' => SORT_DESC, 'created_at' => SORT_ASC])
    ->all($db);

if (!$members) {
    fwrite(STDERR, "No legacy member found for requested mobile\n");
    exit(3);
}

$memberIds = array_values(array_unique(array_map(static fn(array $row): int => (int)$row['id'], $members)));
$moduleTables = [
    'diaries' => 'addon_diary',
    'todos' => 'addon_todo',
    'cards' => 'addon_shroom_card',
    'memory_nodes' => 'addon_memory_node',
    'memory_feedback' => 'addon_memory_feedback',
    'memory_tags' => 'addon_memory_tag',
    'memory_edges' => 'addon_memory_edge',
    'memory_embeddings' => 'addon_memory_embedding',
];

$counts = [];
$statusCounts = [];
$missingTables = [];
$resolvedTables = [];
foreach ($moduleTables as $key => $logicalName) {
    $table = $physicalTable($logicalName);
    $schema = $db->schema->getTableSchema($table, true);
    if ($schema === null) {
        $counts[$key] = 0;
        $missingTables[] = $logicalName;
        continue;
    }

    $resolvedTables[$key] = $table;
    $query = (new yii\db\Query())->from($table)->where(['member_id' => $memberIds]);
    $counts[$key] = (int)$query->count('*', $db);

    if (isset($schema->columns['status'])) {
        $rows = (new yii\db\Query())
            ->select(['status', 'count' => new yii\db\Expression('COUNT(*)')])
            ->from($table)
            ->where(['member_id' => $memberIds])
            ->groupBy(['status'])
            ->all($db);
        $statusCounts[$key] = array_column($rows, 'count', 'status');
    }
}

$payloadShape = [
    'diaries' => [
        'images' => 0,
        'absolute_image_urls' => 0,
        'relative_image_paths' => 0,
        'object_image_refs' => 0,
        'voice_entries' => 0,
        'linked_cards' => 0,
    ],
    'cards' => [
        'practice_cases' => 0,
        'practice_case_keys' => [],
    ],
];
$diaryTimeline = [
    'oldest_at' => null,
    'newest_at' => null,
    'by_month' => [],
    'global_newest_at' => null,
    'global_current_month_count' => 0,
];

if (isset($resolvedTables['diaries'])) {
    $rows = (new yii\db\Query())
        ->select(['images', 'voice', 'linked_cards', 'created_at'])
        ->from($resolvedTables['diaries'])
        ->where(['member_id' => $memberIds])
        ->all($db);
    $timestamps = [];
    $timezone = new DateTimeZone('Asia/Shanghai');
    foreach ($rows as $row) {
        $images = json_decode((string)($row['images'] ?? '[]'), true);
        foreach (is_array($images) ? $images : [] as $image) {
            $payloadShape['diaries']['images']++;
            if (is_array($image)) {
                $payloadShape['diaries']['object_image_refs']++;
                $image = $image['url'] ?? '';
            }
            if (preg_match('#^https?://#i', (string)$image)) {
                $payloadShape['diaries']['absolute_image_urls']++;
            } elseif (str_starts_with((string)$image, '/')) {
                $payloadShape['diaries']['relative_image_paths']++;
            }
        }

        if (!empty($row['voice']) && $row['voice'] !== 'null') {
            $payloadShape['diaries']['voice_entries']++;
        }

        $linkedCards = json_decode((string)($row['linked_cards'] ?? '[]'), true);
        $payloadShape['diaries']['linked_cards'] += is_array($linkedCards) ? count($linkedCards) : 0;

        $timestamp = (int)($row['created_at'] ?? 0);
        if ($timestamp > 0) {
            $timestamps[] = $timestamp;
            $date = (new DateTimeImmutable('@' . $timestamp))->setTimezone($timezone);
            $month = $date->format('Y-m');
            $diaryTimeline['by_month'][$month] = ($diaryTimeline['by_month'][$month] ?? 0) + 1;
        }
    }
    ksort($diaryTimeline['by_month']);
    if ($timestamps) {
        $diaryTimeline['oldest_at'] = (new DateTimeImmutable('@' . min($timestamps)))
            ->setTimezone($timezone)->format(DateTimeInterface::ATOM);
        $diaryTimeline['newest_at'] = (new DateTimeImmutable('@' . max($timestamps)))
            ->setTimezone($timezone)->format(DateTimeInterface::ATOM);
    }

    $globalNewest = (new yii\db\Query())
        ->from($resolvedTables['diaries'])
        ->max('created_at', $db);
    if ((int)$globalNewest > 0) {
        $diaryTimeline['global_newest_at'] = (new DateTimeImmutable('@' . (int)$globalNewest))
            ->setTimezone($timezone)->format(DateTimeInterface::ATOM);
    }
    $monthStart = (new DateTimeImmutable('first day of this month 00:00:00', $timezone))->getTimestamp();
    $nextMonthStart = (new DateTimeImmutable('first day of next month 00:00:00', $timezone))->getTimestamp();
    $diaryTimeline['global_current_month_count'] = (int)(new yii\db\Query())
        ->from($resolvedTables['diaries'])
        ->where(['>=', 'created_at', $monthStart])
        ->andWhere(['<', 'created_at', $nextMonthStart])
        ->count('*', $db);
}

if (isset($resolvedTables['cards'])) {
    $rows = (new yii\db\Query())
        ->select(['practice_cases'])
        ->from($resolvedTables['cards'])
        ->where(['member_id' => $memberIds])
        ->all($db);
    $practiceKeys = [];
    foreach ($rows as $row) {
        $practices = json_decode((string)($row['practice_cases'] ?? '[]'), true);
        foreach (is_array($practices) ? $practices : [] as $practice) {
            $payloadShape['cards']['practice_cases']++;
            if (is_array($practice)) {
                foreach (array_keys($practice) as $key) {
                    $practiceKeys[(string)$key] = true;
                }
            }
        }
    }
    $payloadShape['cards']['practice_case_keys'] = array_keys($practiceKeys);
    sort($payloadShape['cards']['practice_case_keys']);
}

$passwordSchemes = [];
foreach ($members as $member) {
    $hash = (string)($member['password_hash'] ?? '');
    if (preg_match('/^\$2[aby]\$/', $hash)) {
        $passwordSchemes[] = 'bcrypt';
    } elseif (str_starts_with($hash, '$argon2')) {
        $passwordSchemes[] = 'argon2';
    } elseif (substr_count($hash, ':') === 1) {
        $passwordSchemes[] = 'scrypt-like';
    } else {
        $passwordSchemes[] = 'unknown';
    }
}

$summary = [
    'member_count' => count($members),
    'member_ids' => $memberIds,
    'member_statuses' => array_values(array_map(static fn(array $row): int => (int)$row['status'], $members)),
    'password_schemes' => array_values(array_unique($passwordSchemes)),
    'record_counts' => $counts,
    'status_counts' => $statusCounts,
    'payload_shape' => $payloadShape,
    'diary_timeline' => $diaryTimeline,
    'missing_tables' => $missingTables,
];

fwrite(STDOUT, json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
