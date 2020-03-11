const GameState = {
    MENU: 'menu',
    GAME: 'game',
    END: 'End'
}

var Game = function (canvas, gl) {
    this.cameraAngle = 0;

    // TODO: fix readobj
    var playerObj = readobj("player.obj");
    var playerPositions = playerObj[0];
    var playerNormals = playerObj[1];
    var playerTriIndices = playerObj[2];

    //Doing some testing, we can just use these as refrence to meshes and use the render function below multiple times
    //And get multiple renders of the same mesh
    console.log(SpherePositions.length);
    console.log(SphereNormals.length);
    console.log(SphereTriIndices.length);
    this.sphereMesh = new ShadedTriangleMesh(gl, SpherePositions, SphereNormals, SphereTriIndices, LambertVertexSource, LambertFragmentSource);

    //this.cubeMesh = new ShadedTriangleMesh(gl, CubePositions, CubeNormals, CubeIndices, LambertVertexSource, LambertFragmentSource);
    this.playerMesh = new ShadedTriangleMesh(gl, playerPositions, playerNormals, playerTriIndices, LambertVertexSource, LambertFragmentSource);

    /*Initialize Controls of Player*/
    this.playerScaleMatrix = SimpleMatrix.scale(0.5, 0.5, 0.5);
    this.playerColor = [124, 254, 240];
    this.playerLocation = [0, 0, -6];       //starting location of the player, modified in runtime to hold current location
    this.playerInitialRotation = 90;               //starting angle of player in degrees (we only need one axis of rotation)
    this.playerRotation = 0;
    this.translateVector = [0, 0, 0];       //Vector used to start what keys/buttons are being pressed the value stored is how much to move in next frame

    this.playerCollisionBox = generateBoundingBox(playerPositions, 0.5); //Bounding box to detect collisions around player [min x, max x, min y, max y, min z, max z]
    //Scale our player collision box to make easier for player
    for(var i = 0; i < this.playerCollisionBox.length; i++){
        this.playerCollisionBox[i] *= 0.6;
    }

    this.enemyCollisionBox = generateBoundingBox(SpherePositions, 1);    //Bounding box to detect collisions around enemy [min x, max x, min y, max y, min z, max z]
    
    this.screenBounds = [-9.75,9.75,-4.85,4.85]                          //[min x, max x, min y, max y] initizliaed for standard 1080p screen dimensions
    //Scale our bounds from 1080p dimensions to current screen dimensions
    for(var i = 0; i < this.screenBounds.length; i++){
        this.screenBounds[i] *= ((window.innerWidth/window.innerHeight)/ 2.049092849519744 )
    }

    /*Initialize enemies*/
    this.enemies = [] 

    //Declare self for events since context switches to global inside of events
    var self = this;
    ControlsManager.init(self);

    //Initialize Game State
    this.state = GameState.MENU;

    gl.enable(gl.DEPTH_TEST);
}

//TODO: Edit shader code to allow for variable color (or textures??)
Game.prototype.render = function (canvas, gl, w, h) {
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    switch (this.state) {
        case GameState.MENU:
            Menu();
            break;
        case GameState.GAME:
            var self = this;
            GameLogic(self, gl, w, h);
            break;
        case GameState.END:
            EndScreen();
            break;
    }
}

function GameLogic(self, gl, w,h) {
    // now is in milliseconds
    var now = Date.now();

    var projection = SimpleMatrix.perspective(45, w / h, 0.1, 100);

    var view = SimpleMatrix.rotate(self.cameraAngle, 1, 0, 0).multiply(
        SimpleMatrix.translate(0, 0, 6));

    //Interpolate our translation values to zero if not pressed
    //this creates the illusion of momentum
    if( self.translateVector[0] != 5 && self.translateVector[0] > 0)
        self.translateVector[0] -= 0.25;
    else if( self.translateVector[0] != -5 && self.translateVector[0] < 0)
        self.translateVector[0] += 0.25;

    if( self.translateVector[1] != -0.08 && self.translateVector[1] < 0)
        self.translateVector[1] += 0.001;


    /* Player movement code */
    var flip = SimpleMatrix.rotate(180, 1, 0, 0);
    var initialRotation = flip.multiply(SimpleMatrix.rotate(self.playerInitialRotation, 1, 0, 0));
    var angle = self.playerRotation + self.translateVector[0];
    var rotation = initialRotation.multiply(SimpleMatrix.rotate(angle, 0, 1, 0));

    //Calculate forward vector based on rotation
    //convert our angle to radians
    angle = -(90 + angle) * Math.PI / 180;
    var forwardVector = [Math.cos(angle) * self.translateVector[1], Math.sin(angle) * self.translateVector[1], 0]

    //Clamp our x and y positions within the screen bounds
    var clampedPositon = [Math.min(Math.max(self.playerLocation[0] + forwardVector[0], self.screenBounds[0]), self.screenBounds[1]), 
                          Math.min(Math.max(self.playerLocation[1] + forwardVector[1], self.screenBounds[2]), self.screenBounds[3])];

    var playerTransform = SimpleMatrix.translate(clampedPositon[0], clampedPositon[1], self.playerLocation[2]).multiply(rotation).multiply(self.playerScaleMatrix);

    //Update player location and roation after transformation
    self.playerLocation[0] = clampedPositon[0];
    self.playerLocation[1] = clampedPositon[1];
    self.playerRotation += self.translateVector[0];


    /* Enemy generation code */
    // spawn new enemy every 2.5 seconds (uses <= 15 because render isn't called every millisecond)
    if (now % 2500 <= 15) {
        // New enemy
        self.enemies.push(new Enemy(self.playerLocation, now));
    }

    /* Enemy movement code */
    var enemyTransform;
    self.enemies.forEach(enemy => {
        // Delete enemies older than 10 seconds
        if (now - enemy.age > 10000) {
            //TODO: figure out a better way
            self.enemies.shift();
            //continue;
        }
        enemyTransform = enemy.translate;

        self.sphereMesh.render(gl, enemyTransform, view, projection, enemy.color);

        //Detect if we are colliding with player
        if(BoxCollision(enemy.currentLocation, self.enemyCollisionBox, self.playerLocation, self.playerCollisionBox)){
            self.state = GameState.END;
            ResetGame(self);
        }
    });

    //Create collision detection that we check every frame here

    //Implement game state that changes this whole render function depending on state

    self.playerMesh.render(gl, playerTransform, view, projection, self.playerColor);
}

function ResetGame (self){
    //Add a delay to ensure our game is reloaded
    //Solves a glitch with momentum calculations
    setTimeout(function(){ 
        //Reset Player to defaults
        self.playerLocation = [0, 0, -6];
        self.playerRotation = 90;
        self.translateVector = [0, 0, 0];

        //Remove all enemies
        self.enemies = []
    }, 1000);
}
