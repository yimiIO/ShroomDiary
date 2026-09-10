BEGIN;

CREATE TABLE IF NOT EXISTS friends (
    id varchar(96) NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    category varchar(48) NOT NULL DEFAULT '朋友',
    relationship text NOT NULL DEFAULT '',
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    contact jsonb NOT NULL DEFAULT '{}'::jsonb,
    relation_score smallint NOT NULL DEFAULT 4,
    trust_score smallint,
    value_score smallint,
    energy_score smallint,
    last_interaction date,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id),
    UNIQUE (user_id, name),
    CONSTRAINT friends_relation_score_check CHECK (relation_score BETWEEN 1 AND 10),
    CONSTRAINT friends_trust_score_check CHECK (trust_score IS NULL OR trust_score BETWEEN 1 AND 10),
    CONSTRAINT friends_value_score_check CHECK (value_score IS NULL OR value_score BETWEEN 1 AND 10),
    CONSTRAINT friends_energy_score_check CHECK (energy_score IS NULL OR energy_score BETWEEN 1 AND 10)
);
CREATE INDEX IF NOT EXISTS friends_user_score_idx
    ON friends(user_id, relation_score DESC, last_interaction DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS interactions (
    id varchar(96) NOT NULL,
    user_id uuid NOT NULL,
    friend_id varchar(96) NOT NULL,
    interaction_date date NOT NULL,
    interaction_type varchar(48) NOT NULL DEFAULT '互动',
    topic text NOT NULL DEFAULT '',
    sentiment varchar(16) NOT NULL DEFAULT 'neutral',
    notes text NOT NULL DEFAULT '',
    follow_up text NOT NULL DEFAULT '',
    diary_id varchar(128),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id, friend_id) REFERENCES friends(user_id, id) ON DELETE CASCADE,
    CONSTRAINT interactions_sentiment_check CHECK (sentiment IN ('positive', 'neutral', 'negative'))
);
CREATE INDEX IF NOT EXISTS interactions_friend_date_idx
    ON interactions(user_id, friend_id, interaction_date DESC);

CREATE TABLE IF NOT EXISTS score_histories (
    id varchar(96) NOT NULL,
    user_id uuid NOT NULL,
    friend_id varchar(96) NOT NULL,
    score_date date NOT NULL,
    change smallint NOT NULL,
    reason text NOT NULL,
    rule_code varchar(64),
    diary_id varchar(128),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id, friend_id) REFERENCES friends(user_id, id) ON DELETE CASCADE,
    CONSTRAINT score_histories_change_check CHECK (change BETWEEN -3 AND 3 AND change <> 0)
);
CREATE INDEX IF NOT EXISTS score_histories_friend_date_idx
    ON score_histories(user_id, friend_id, score_date DESC);

CREATE TABLE IF NOT EXISTS friend_todos (
    id varchar(96) NOT NULL,
    user_id uuid NOT NULL,
    friend_id varchar(96) NOT NULL,
    task text NOT NULL,
    due_date date,
    status varchar(16) NOT NULL DEFAULT 'pending',
    global_todo_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id, friend_id) REFERENCES friends(user_id, id) ON DELETE CASCADE,
    CONSTRAINT friend_todos_status_check CHECK (status IN ('pending', 'done', 'overdue', 'cancelled', 'created'))
);
CREATE INDEX IF NOT EXISTS friend_todos_friend_status_idx
    ON friend_todos(user_id, friend_id, status, due_date);

CREATE TABLE IF NOT EXISTS friend_milestones (
    id varchar(96) NOT NULL,
    user_id uuid NOT NULL,
    friend_id varchar(96) NOT NULL,
    milestone_date date NOT NULL,
    event text NOT NULL,
    context text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id, friend_id) REFERENCES friends(user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS friend_milestones_friend_date_idx
    ON friend_milestones(user_id, friend_id, milestone_date DESC);

COMMIT;
