<?php

declare(strict_types=1);

/**
 * Print column metadata for the legacy Shroom tables without reading row data.
 *
 * Usage:
 *   php legacy_schema.php <legacy-app-root>
 */

if ($argc !== 2) {
    fwrite(STDERR, "Usage: php legacy_schema.php <legacy-app-root>\n");
    exit(64);
}

$appRoot = rtrim($argv[1], '/');

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

$tables = [
    'member',
    'addon_diary',
    'addon_todo',
    'addon_shroom_card',
    'addon_memory_node',
    'addon_memory_feedback',
];

$result = [];
foreach ($tables as $logicalName) {
    $physicalName = $prefix . $logicalName;
    $schema = $db->schema->getTableSchema($physicalName, true);
    if ($schema === null) {
        $result[$logicalName] = null;
        continue;
    }

    $result[$logicalName] = array_values(array_map(
        static fn($column): array => [
            'name' => $column->name,
            'db_type' => $column->dbType,
            'allow_null' => $column->allowNull,
        ],
        $schema->columns
    ));
}

fwrite(STDOUT, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
