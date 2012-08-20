/*
Copyright 2009 University of Toronto
Copyright 2011 Charly Molter
Copyright 2011-2012 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/*global jQuery, window, swfobject, fluid, MediaElement*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */


(function ($) {

    /*********************************************************************************
     * Video Player Media                                                            *
     *                                                                               *
     * Composes markup for video sources and responds to the video events            *
     *********************************************************************************/

    fluid.defaults("fluid.videoPlayer.media", {
        gradeNames: ["fluid.viewComponent", "autoInit"],
        components: {
            mediaEventBinder: {
                type: "fluid.videoPlayer.eventBinder",
                createOnEvent: "onMediaReady"
            },
            intervalEventsConductor: {
                type: "fluid.videoPlayer.intervalEventsConductor",
                createOnEvent: "onMediaReady"
            }
        },
        finalInitFunction: "fluid.videoPlayer.media.finalInit",
        preInitFunction: "fluid.videoPlayer.media.preInit",
        events: {
            onLoadedMetadata: null,
            onMediaReady: null
        },
        sourceRenderers: {
            "video/mp4": "fluid.videoPlayer.media.createSourceMarkup.html5SourceTag",
            "video/webm": "fluid.videoPlayer.media.createSourceMarkup.html5SourceTag",
            "video/ogg": "fluid.videoPlayer.media.createSourceMarkup.html5SourceTag",
            "video/ogv": "fluid.videoPlayer.media.createSourceMarkup.html5SourceTag",
            "youtube": "fluid.videoPlayer.media.createSourceMarkup.youTubePlayer"
        },
        sources: []
    });

    fluid.videoPlayer.media.createSourceMarkup = {
        html5SourceTag: function (videoPlayer, mediaSource) {
            var sourceTag = $("<source />");
            sourceTag.attr(mediaSource);
            videoPlayer.container.append(sourceTag);
            return sourceTag;
        },
        youTubePlayer: function (videoPlayer, mediaSource) {
            var placeholder = $("<div/>"),
                id = fluid.allocateSimpleId(placeholder);
            videoPlayer.container.append(placeholder);
            swfobject.embedSWF(mediaSource.src, id, "425", "356", "8");
            return placeholder;
        }
    };
    
    var renderSources = function (that) {
        $.each(that.options.sources, function (idx, source) {
            var renderer = that.options.sourceRenderers[source.type];
            if ($.isFunction(renderer)) {
                renderer.apply(null, [that, source]);
            } else {
                fluid.invokeGlobalFunction(renderer, [that, source]);
            }
        });
    };

    var bindMediaModel = function (that) {
        that.applier.modelChanged.addListener("play", that.play);
        that.applier.modelChanged.addListener("muted", that.mute);
        fluid.addSourceGuardedListener(that.applier, 
            "volume", "media", that.updateVolume);
    };

    var getcanPlayData = function (data) {
        return data.readyState === 4 || data.readyState === 3 
            || data.readyState === 2; 
    };

    var bindMediaDOMEvents = function (that) {      
        MediaElement(that.container[0], {success: function (mediaElementVideo) {
            console.log('assigning');
            that.model.mediaElementVideo = mediaElementVideo;
            
            // IE8 workaround to trigger the video initial loading. Otherwise, a blank is displayed at the video area
            // Html5 browsers tolerate this workaround without initiatively playing the video
            mediaElementVideo.play();
            
            document.getElementById('pp')['onclick'] = function() {
                if (mediaElementVideo.paused)
                    mediaElementVideo.play();
                else
                    mediaElementVideo.pause();
            };

            mediaElementVideo.addEventListener("durationchange", function () {
                // FF doesn't implement startTime from the HTML 5 spec.
                console.log("event duration change");
                var startTime = mediaElementVideo.startTime || 0;
                that.applier.fireChangeRequest({
                    path: "totalTime",
                    value: mediaElementVideo.duration
                });
                that.applier.fireChangeRequest({
                    path: "currentTime",
                    value: mediaElementVideo.currentTime
                });
                that.applier.fireChangeRequest({
                    path: "startTime",
                    value: startTime
                });
            });

            mediaElementVideo.addEventListener("volumechange", function () {
                console.log("event volume change");
                var mediaVolume = mediaElementVideo.volume * 100;
                // Don't fire self-generated volume changes on zero when muted, to avoid cycles
                if (!that.model.muted || mediaVolume !== 0) {
                    fluid.fireSourcedChange(that.applier, "volume", mediaVolume, "media");
                }
            });

            // all browser don't support the canplay so we do all different states
            mediaElementVideo.addEventListener("canplay", function () {
                console.log("event canplay");
                that.applier.fireChangeRequest({
                    path: "canPlay",
                    value: getcanPlayData(mediaElementVideo)
                });
            });

            mediaElementVideo.addEventListener("canplaythrough", function () {
                console.log("event canplaythrough");
                that.applier.fireChangeRequest({
                    path: "canPlay",
                    value: getcanPlayData(mediaElementVideo)
                });
            });

            mediaElementVideo.addEventListener("loadeddata", function () {
                console.log("event loadeddata");
                that.applier.fireChangeRequest({
                    path: "canPlay",
                    value: getcanPlayData(mediaElementVideo)
                });
            });

            mediaElementVideo.addEventListener("ended", function () {
                console.log("event ended");
                that.applier.fireChangeRequest({
                    path: "play",
                    value: false
                });
                that.applier.fireChangeRequest({
                    path: "currentTime",
                    value: 0
                });
            });
            
            mediaElementVideo.addEventListener("loadedmetadata", function () {
                // escalated to the main videoPlayer component
                that.events.onLoadedMetadata.fire();
            });

            that.events.onMediaReady.fire(that);
        }});

    };

    fluid.videoPlayer.media.preInit = function (that) {
        that.updateCurrentTime = function (currentTime, buffered) {
            console.log("updateCurrentTime: " + currentTime);
            that.applier.fireChangeRequest({
                path: "currentTime", 
                value: currentTime
            });
            that.applier.fireChangeRequest({
                path: "buffered", 
                value: buffered
            });
        };
        
        that.setTime = function (time) {
            if (!that.model.mediaElementVideo) return;
            console.log("in setTime");
            that.model.mediaElementVideo.currentTime = time;
        };

        that.updateVolume = function () {
            if (!that.model.mediaElementVideo) return;
            console.log("in updateVolume");
            that.model.mediaElementVideo.volume = that.model.volume / 100;
        };

        that.play = function () {
            console.log("play");
            if (!that.model.mediaElementVideo) return;
            
            if (that.model.play === true) {
                console.log("in play - play");
                that.model.mediaElementVideo.play();
            } else {
                console.log("in play - pause");
                that.model.mediaElementVideo.pause();
            }
        };

        that.mute = function () {
            if (!that.model.mediaElementVideo) return;
            console.log("in mute");
            that.model.mediaElementVideo.muted = that.model.muted;
        };

        that.refresh = function () {
            that.updateVolume();
            that.play();
        };
    };

//    var bindMediaDOMEvents = function (that) {      
//        var video = that.container;
//
//        video.bind("durationchange", {obj: video[0]}, function (ev) {
//            // FF doesn't implement startTime from the HTML 5 spec.
//            var startTime = ev.data.obj.startTime || 0;
//            that.applier.fireChangeRequest({
//                path: "totalTime",
//                value: ev.data.obj.duration
//            });
//            that.applier.fireChangeRequest({
//                path: "currentTime",
//                value: ev.data.obj.currentTime
//            });
//            that.applier.fireChangeRequest({
//                path: "startTime",
//                value: startTime
//            });
//        });
//
//        video.bind("volumechange", {obj: video[0]}, function (ev) {
//            var mediaVolume = ev.data.obj.volume * 100;
//            // Don't fire self-generated volume changes on zero when muted, to avoid cycles
//            if (!that.model.muted || mediaVolume !== 0) {
//                fluid.fireSourcedChange(that.applier, "volume", mediaVolume, "media");
//            }
//        });
//
//        //all browser don't support the canplay so we do all different states
//        video.bind("canplay", {obj: video[0]}, function (ev) {
//            that.applier.fireChangeRequest({
//                path: "canPlay",
//                value: getcanPlayData(ev.data.obj)
//            });
//        });
//
//        video.bind("canplaythrough", {obj: video[0]}, function (ev) {
//            that.applier.fireChangeRequest({
//                path: "canPlay",
//                value: getcanPlayData(ev.data.obj)
//            });
//        });
//
//        video.bind("loadeddata", {obj: video[0]}, function (ev) {
//            that.applier.fireChangeRequest({
//                path: "canPlay",
//                value: getcanPlayData(ev.data.obj)
//            });
//        });
//
//        video.bind("ended", function () {
//            that.applier.fireChangeRequest({
//                path: "play",
//                value: false
//            });
//            that.applier.fireChangeRequest({
//                path: "currentTime",
//                value: 0
//            });
//        });
//    };
//
//    fluid.videoPlayer.media.preInit = function (that) {
//        that.updateCurrentTime = function (currentTime, buffered) {
//            that.applier.fireChangeRequest({
//                path: "currentTime", 
//                value: currentTime
//            });
//            that.applier.fireChangeRequest({
//                path: "buffered", 
//                value: buffered
//            });
//        };
//        
//        that.setTime = function (time) {
//            that.container[0].currentTime = time;
//        };
//
//        that.updateVolume = function () {
//            that.container[0].volume = that.model.volume / 100;
//        };
//
//        that.play = function () {
//            if (that.model.play === true) {
//                that.container[0].play();
//            } else {
//                that.container[0].pause();
//            }
//        };
//
//        that.mute = function () {
//            that.container[0].muted = that.model.muted;
//        };
//
//        that.refresh = function () {
//            that.updateVolume();
//            that.play();
//        };
//    };

    fluid.videoPlayer.media.finalInit = function (that) {
        renderSources(that);
        bindMediaModel(that);
        bindMediaDOMEvents(that);
    };

})(jQuery);
